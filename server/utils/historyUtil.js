const { Op } = require('sequelize');
const SampleEntryAuditLog = require('../models/SampleEntryAuditLog');

const hasAlphaOrPositive = (value) => {
  if (value === null || value === undefined) return false;
  const raw = String(value).trim();
  if (!raw) return false;
  if (/[a-zA-Z]/.test(raw)) return true;
  const num = parseFloat(raw);
  return Number.isFinite(num);
};

const isProvidedNumeric = (rawVal, valueVal) => {
  const raw = rawVal !== null && rawVal !== undefined ? String(rawVal).trim() : '';
  if (raw !== '') return true;
  const num = Number(valueVal);
  return Number.isFinite(num) && num > 0;
};
const isProvidedAlpha = (rawVal, valueVal) => {
  const raw = rawVal !== null && rawVal !== undefined ? String(rawVal).trim() : '';
  if (raw !== '') return true;
  return hasAlphaOrPositive(valueVal);
};

const hasQualityData = (qp) => {
  if (!qp) return false;
  const moisture = isProvidedNumeric(qp.moistureRaw, qp.moisture);
  const grains = isProvidedNumeric(qp.grainsCountRaw, qp.grainsCount);
  const cutting = isProvidedNumeric(qp.cutting1Raw, qp.cutting1);
  const bend = isProvidedNumeric(qp.bend1Raw, qp.bend1);
  const mix = isProvidedAlpha(qp.mixRaw, qp.mix)
    || isProvidedAlpha(qp.mixSRaw, qp.mixS)
    || isProvidedAlpha(qp.mixLRaw, qp.mixL);
  return moisture && (grains || cutting || bend || mix);
};

const hasCookingData = (cr) => {
  if (!cr) return false;
  const status = String(cr.status || '').trim();
  const doneBy = String(cr.cookingDoneBy || '').trim();
  const approvedBy = String(cr.cookingApprovedBy || '').trim();
  return !!(status || doneBy || approvedBy);
};

const normalizeAuditMetadata = (metadata) => {
  if (!metadata) return null;
  if (typeof metadata === 'string') {
    try {
      return JSON.parse(metadata);
    } catch (error) {
      return null;
    }
  }
  return metadata;
};

const attachLoadingLotsHistories = async (rows) => {
  if (!Array.isArray(rows) || rows.length === 0) return rows;

  const pushHistoryValue = (list, value) => {
    const normalized = typeof value === 'string' ? value.trim() : '';
    if (!normalized) return;
    const lower = normalized.toLowerCase();
    if (list.some((item) => String(item).toLowerCase() === lower)) return;
    list.push(normalized);
  };
  
  const buildQualityAttemptDetail = (source, fallbackCreatedAt) => {
    if (!source) return null;

    const reportedBy = typeof source.reportedBy === 'string' ? source.reportedBy.trim() : '';
    const detail = {
      reportedBy,
      createdAt: source.updatedAt || source.createdAt || fallbackCreatedAt || null,
      moisture: source.moisture ?? null,
      moistureRaw: source.moistureRaw ?? null,
      dryMoisture: source.dryMoisture ?? null,
      dryMoistureRaw: source.dryMoistureRaw ?? null,
      cutting1: source.cutting1 ?? null,
      cutting2: source.cutting2 ?? null,
      cutting1Raw: source.cutting1Raw ?? null,
      cutting2Raw: source.cutting2Raw ?? null,
      bend1: source.bend1 ?? null,
      bend2: source.bend2 ?? null,
      bend1Raw: source.bend1Raw ?? null,
      bend2Raw: source.bend2Raw ?? null,
      mixS: source.mixS ?? null,
      mixL: source.mixL ?? null,
      mix: source.mix ?? null,
      mixSRaw: source.mixSRaw ?? null,
      mixLRaw: source.mixLRaw ?? null,
      mixRaw: source.mixRaw ?? null,
      kandu: source.kandu ?? null,
      oil: source.oil ?? null,
      sk: source.sk ?? null,
      kanduRaw: source.kanduRaw ?? null,
      oilRaw: source.oilRaw ?? null,
      skRaw: source.skRaw ?? null,
      grainsCount: source.grainsCount ?? null,
      grainsCountRaw: source.grainsCountRaw ?? null,
      wbR: source.wbR ?? null,
      wbBk: source.wbBk ?? null,
      wbT: source.wbT ?? null,
      wbRRaw: source.wbRRaw ?? null,
      wbBkRaw: source.wbBkRaw ?? null,
      wbTRaw: source.wbTRaw ?? null,
      paddyWb: source.paddyWb ?? null,
      paddyWbRaw: source.paddyWbRaw ?? null,
      gramsReport: source.gramsReport ?? null
    };

    const hasData = Object.values(detail).some((value) => value !== null && value !== '' && value !== undefined);
    return hasData ? detail : null;
  };

  const sampleEntryIds = rows
    .map((row) => row?.id)
    .filter(Boolean);

  const qualityIds = rows
    .map((row) => row?.qualityParameters?.id)
    .filter(Boolean);

  if (sampleEntryIds.length === 0 && qualityIds.length === 0) return rows;

  const [sampleEntryLogs, qualityLogs] = await Promise.all([
    sampleEntryIds.length > 0
      ? SampleEntryAuditLog.findAll({
        where: {
          tableName: 'sample_entries',
          actionType: { [Op.in]: ['CREATE', 'UPDATE', 'WORKFLOW_TRANSITION'] },
          recordId: { [Op.in]: sampleEntryIds }
        },
        attributes: ['recordId', 'actionType', 'newValues', 'createdAt', 'metadata'],
        order: [['createdAt', 'ASC']],
        raw: true
      })
      : [],
    qualityIds.length > 0
      ? SampleEntryAuditLog.findAll({
        where: {
          tableName: 'quality_parameters',
          actionType: { [Op.in]: ['CREATE', 'UPDATE'] },
          recordId: { [Op.in]: qualityIds }
        },
        attributes: ['recordId', 'newValues', 'createdAt'],
        order: [['createdAt', 'ASC']],
        raw: true
      })
      : []
  ]);

  const sampleEntryLogsByEntryId = new Map();
  sampleEntryLogs.forEach((log) => {
    const key = String(log.recordId);
    if (!sampleEntryLogsByEntryId.has(key)) sampleEntryLogsByEntryId.set(key, []);
    sampleEntryLogsByEntryId.get(key).push(log);
  });

  const qualityHistoryByQualityId = new Map();
  qualityLogs.forEach((log) => {
    const key = String(log.recordId);
    if (!qualityHistoryByQualityId.has(key)) qualityHistoryByQualityId.set(key, []);
    qualityHistoryByQualityId.get(key).push(log);
  });

  rows.forEach((row) => {
    const target = row?.dataValues || row;
    const sampleEntryAuditLogs = sampleEntryLogsByEntryId.get(String(row?.id)) || [];

    const recheckLogs = sampleEntryAuditLogs.filter((log) => {
      if (log.actionType !== 'WORKFLOW_TRANSITION') return false;
      const meta = normalizeAuditMetadata(log.metadata);
      return meta?.recheckRequested === true;
    });
    if (recheckLogs.length > 0) {
      const latestRecheck = recheckLogs[recheckLogs.length - 1];
      const latestMeta = normalizeAuditMetadata(latestRecheck.metadata) || null;
      const recheckType = latestMeta?.recheckType || null;
      const recheckAt = latestRecheck.createdAt || null;
      const previousDecision = latestMeta?.previousDecision || null;
      const recheckTime = recheckAt ? new Date(recheckAt).getTime() : null;

      const qualityUpdatedAt = row?.qualityParameters?.updatedAt || row?.qualityParameters?.createdAt || null;
      const cookingUpdatedAt = row?.cookingReport?.updatedAt || row?.cookingReport?.createdAt || null;
      const qualityTime = qualityUpdatedAt ? new Date(qualityUpdatedAt).getTime() : null;
      const cookingTime = cookingUpdatedAt ? new Date(cookingUpdatedAt).getTime() : null;

      const qualityDone = !!(qualityTime && recheckTime && qualityTime >= recheckTime) && hasQualityData(row?.qualityParameters);
      const cookingDone = !!(cookingTime && recheckTime && cookingTime >= recheckTime) && hasCookingData(row?.cookingReport);

      let isPending = true;
      if (recheckType === 'quality') {
        isPending = !qualityDone;
      } else if (recheckType === 'cooking') {
        isPending = !cookingDone;
      } else if (recheckType === 'both') {
        isPending = !(qualityDone && cookingDone);
      } else {
        isPending = false;
      }

      const qualityPending = (recheckType === 'quality' || recheckType === 'both') ? !qualityDone : false;
      const cookingPending = (recheckType === 'cooking' || recheckType === 'both') ? !cookingDone : false;

      target.recheckRequested = isPending;
      target.recheckType = isPending ? recheckType : null;
      target.recheckAt = isPending ? recheckAt : null;
      target.qualityPending = isPending ? qualityPending : false;
      target.cookingPending = isPending ? cookingPending : false;
      target.recheckPreviousDecision = isPending ? previousDecision : null;
    } else {
      target.recheckRequested = false;
      target.recheckType = null;
      target.recheckAt = null;
      target.qualityPending = false;
      target.cookingPending = false;
      target.recheckPreviousDecision = null;
    }
    
    // Extract sampleCollectedBy history
    const sampleCollectedHistory = [];
    sampleEntryAuditLogs.forEach((log) => {
      if (log.actionType !== 'WORKFLOW_TRANSITION') {
        const sampleCollectedBy = typeof log.newValues?.sampleCollectedBy === 'string'
          ? log.newValues.sampleCollectedBy.trim()
          : '';
        pushHistoryValue(sampleCollectedHistory, sampleCollectedBy);
      }
    });

    const currentSampleCollectedBy = typeof row?.sampleCollectedBy === 'string'
      ? row.sampleCollectedBy.trim()
      : '';

    if (currentSampleCollectedBy) {
      pushHistoryValue(sampleCollectedHistory, currentSampleCollectedBy);
    }

    target.sampleCollectedHistory = sampleCollectedHistory;

    const qualityId = row?.qualityParameters?.id;
    if (!qualityId) {
      target.qualityReportHistory = [];
      target.qualityReportAttempts = 0;
      target.qualityAttemptDetails = [];
      return;
    }

    // ReportedBy history from quality logs
    const history = [];
    const auditLogs = qualityHistoryByQualityId.get(String(qualityId)) || [];

    auditLogs.forEach((log) => {
      const reportedBy = typeof log.newValues?.reportedBy === 'string'
        ? log.newValues.reportedBy.trim()
        : '';
      pushHistoryValue(history, reportedBy);
    });

    const currentReportedBy = typeof row.qualityParameters?.reportedBy === 'string'
      ? row.qualityParameters.reportedBy.trim()
      : '';

    if (currentReportedBy) {
      pushHistoryValue(history, currentReportedBy);
    }
    
    target.qualityReportHistory = history;

    // --- Refined Quality Attempt Grouping Logic ---
    // Boundaries are transitions TO 'QUALITY_CHECK'
    const transitionLogs = sampleEntryAuditLogs.filter(l => 
      l.actionType === 'WORKFLOW_TRANSITION' && 
      l.newValues?.workflowStatus === 'QUALITY_CHECK'
    );
    
    const qualityAttemptDetails = [];
    
    if (transitionLogs.length > 0) {
      // Each transition marks the start of a new attempt.
      // If quality logs exist BEFORE the first transition, treat that as Attempt 1,
      // and shift transitions to define Attempt 2, 3, ...

      const firstTransitionTime = new Date(transitionLogs[0].createdAt).getTime();
      const hasPreTransitionLogs = auditLogs.some((qLog) => new Date(qLog.createdAt).getTime() < firstTransitionTime);
      const attemptCount = transitionLogs.length + (hasPreTransitionLogs ? 1 : 0);
      const attempts = Array.from({ length: attemptCount }, () => []);

      const getAttemptIndexForTime = (timeMs) => {
        if (hasPreTransitionLogs && timeMs < firstTransitionTime) return 0;
        const offset = hasPreTransitionLogs ? 1 : 0;
        for (let j = transitionLogs.length - 1; j >= 0; j--) {
          const tTime = new Date(transitionLogs[j].createdAt).getTime();
          if (timeMs >= tTime) {
            return j + offset;
          }
        }
        return 0;
      };

      auditLogs.forEach((qLog) => {
        const qTime = new Date(qLog.createdAt).getTime();
        const targetAttemptIdx = getAttemptIndexForTime(qTime);
        attempts[targetAttemptIdx].push(qLog);
      });
      
      let seqAttemptNo = 1;
      attempts.forEach((group) => {
        if (group.length > 0) {
          // Search backwards for the last non-null detail in this attempt.
          let detail = null;
          for (let k = group.length - 1; k >= 0; k--) {
            const potentialLog = group[k];
            const potentialDetail = buildQualityAttemptDetail(potentialLog.newValues, potentialLog.createdAt);
            if (potentialDetail) {
              detail = potentialDetail;
              break;
            }
          }
          
          if (detail) {
            qualityAttemptDetails.push({ attemptNo: seqAttemptNo++, ...detail });
          }
        }
      });
      
      // Always include current state as the latest attempt
      const currentDetail = buildQualityAttemptDetail(row.qualityParameters, row.qualityParameters?.updatedAt || row.qualityParameters?.createdAt);
      if (currentDetail) {
        const currentTime = new Date(row.qualityParameters.updatedAt || row.qualityParameters.createdAt).getTime();
        const currentAttemptIdx = getAttemptIndexForTime(currentTime);
        
        // Find if we already have a record matching this specific bucket
        // If not, it's a new sequential attempt.
        const existingIdx = qualityAttemptDetails.findIndex((item) => {
          // Check if this item was built from logs that fall into the same bucket as the current data
          const itemTime = new Date(item.createdAt).getTime();
          return getAttemptIndexForTime(itemTime) === currentAttemptIdx;
        });

        if (existingIdx >= 0) {
          // Update the existing sequential attempt with the most recent live data
          qualityAttemptDetails[existingIdx] = { ...qualityAttemptDetails[existingIdx], ...currentDetail };
        } else {
          // Add as a new sequential attempt
          qualityAttemptDetails.push({ attemptNo: seqAttemptNo++, ...currentDetail });
        }
      }

      qualityAttemptDetails.sort((a, b) => (a.attemptNo || 0) - (b.attemptNo || 0));
    } else {
      // Fallback if no transition logs (should not happen in normal workflow)
      const fallbackDetail = buildQualityAttemptDetail(row.qualityParameters, row.createdAt);
      if (fallbackDetail) {
        qualityAttemptDetails.push({ attemptNo: 1, ...fallbackDetail });
      }
    }

    target.qualityReportAttempts = qualityAttemptDetails.length;
    target.qualityAttemptDetails = qualityAttemptDetails;
  });

  return rows;
};

module.exports = {
  attachLoadingLotsHistories
};
