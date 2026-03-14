const { Op } = require('sequelize');
const SampleEntryAuditLog = require('../models/SampleEntryAuditLog');

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

    const recheckLogs = sampleEntryAuditLogs.filter((log) =>
      log.actionType === 'WORKFLOW_TRANSITION'
      && log.metadata
      && log.metadata.recheckRequested === true
    );
    if (recheckLogs.length > 0) {
      const latestRecheck = recheckLogs[recheckLogs.length - 1];
      target.recheckRequested = true;
      target.recheckType = latestRecheck.metadata?.recheckType || null;
      target.recheckAt = latestRecheck.createdAt || null;
    } else {
      target.recheckRequested = false;
      target.recheckType = null;
      target.recheckAt = null;
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
      // Attempt 1: From start of entry until transition 2
      // Attempt 2: From transition 2 until transition 3...
      
      // Group quality logs by transition interval
      // Note: First attempt might have quality logs BEFORE the first transition (CREATE action).
      // We group them based on which transition they fall into.
      
      const attempts = [];
      for (let i = 0; i < transitionLogs.length; i++) {
        attempts.push([]);
      }
      
      auditLogs.forEach((qLog) => {
        const qTime = new Date(qLog.createdAt).getTime();
        
        // Find the attempt this log belongs to.
        // It belongs to Attempt N if qTime >= Transition N time AND qTime < Transition N+1 time.
        // Exception: if qTime < Transition 1, it still belongs to Attempt 1.
        let targetAttemptIdx = 0;
        for (let j = transitionLogs.length - 1; j >= 0; j--) {
          const tTime = new Date(transitionLogs[j].createdAt).getTime();
          if (qTime >= tTime) {
            targetAttemptIdx = j;
            break;
          }
        }
        attempts[targetAttemptIdx].push(qLog);
      });
      
      attempts.forEach((group, index) => {
        if (group.length > 0) {
          // Search backwards for the last non-null detail in this attempt.
          // This handles cases where a reset occurred AFTER a transition but was logged.
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
            qualityAttemptDetails.push({ attemptNo: index + 1, ...detail });
          }
        }
      });
      
      // Always include current state as the latest attempt if it's newer than the last log
      const currentDetail = buildQualityAttemptDetail(row.qualityParameters, row.qualityParameters?.updatedAt || row.qualityParameters?.createdAt);
      if (currentDetail) {
        // Find if current state belongs to the last attempt or a new one
        const lastTransition = transitionLogs[transitionLogs.length - 1];
        const lastTransitionTime = new Date(lastTransition.createdAt).getTime();
        const currentTime = new Date(row.qualityParameters.updatedAt || row.qualityParameters.createdAt).getTime();
        
        // If currentTime is after the last transition, it belongs to the last attempt
        // (Since transitionLogs already accounts for all rechecks)
        if (qualityAttemptDetails.length === transitionLogs.length) {
            // Update last attempt with current data to ensure most recent edits are shown
            const lastIdx = qualityAttemptDetails.length - 1;
            qualityAttemptDetails[lastIdx] = { attemptNo: qualityAttemptDetails[lastIdx].attemptNo, ...currentDetail };
        } else if (currentTime >= lastTransitionTime) {
            // This shouldn't happen often if audit logs are complete, but safe backup
            qualityAttemptDetails.push({ attemptNo: transitionLogs.length, ...currentDetail });
        }
      }
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
