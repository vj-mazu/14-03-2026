import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { API_URL } from '../config/api';
import { toast } from '../utils/toast';

/**
 * AdminSampleBook2 — Broker-Grouped Sample Book
 * Same data as AdminSampleBook but rendered in the staff-style
 * broker-grouped design (date bar → red broker bar → table).
 */

interface SampleEntry {
    id: string;
    serialNo?: number;
    entryDate: string;
    createdAt: string;
    brokerName: string;
    variety: string;
    partyName: string;
    location: string;
    bags: number;
    packaging?: string;
    lorryNumber?: string;
    entryType?: string;
    sampleCollectedBy?: string;
    workflowStatus: string;
    lotSelectionDecision?: string;
    lotSelectionAt?: string;
    qualityReportAttempts?: number;
    qualityParameters?: {
        moisture: number;
        cutting1: number;
        cutting2: number;
        bend: number;
        bend1: number;
        bend2: number;
        mixS: number;
        mixL: number;
        mix: number;
        kandu: number;
        oil: number;
        sk: number;
        grainsCount: number;
        wbR: number;
        wbBk: number;
        wbT: number;
        paddyWb: number;
        reportedBy: string;
        uploadFileUrl?: string;
    };
    cookingReport?: {
        status: string;
        cookingResult: string;
        recheckCount?: number;
        remarks?: string;
        cookingDoneBy?: string;
        cookingApprovedBy?: string;
        history?: Array<{
            date?: string | null;
            status?: string | null;
            cookingDoneBy?: string | null;
            approvedBy?: string | null;
            remarks?: string | null;
        }>;
    };
    offering?: {
        finalPrice?: number;
        offeringPrice?: number;
        offerBaseRateValue?: number;
        baseRateType?: string;
        baseRateUnit?: string;
        finalBaseRate?: number;
        finalBaseRateType?: string;
        finalBaseRateUnit?: string;
        finalSute?: number;
        finalSuteUnit?: string;
        sute?: number;
        suteUnit?: string;
        moistureValue?: number;
        hamali?: number;
        hamaliUnit?: string;
        brokerage?: number;
        brokerageUnit?: string;
        lf?: number;
        lfUnit?: string;
        egbType?: string;
        egbValue?: number;
        cdEnabled?: boolean;
        cdValue?: number;
        cdUnit?: string;
        bankLoanEnabled?: boolean;
        bankLoanValue?: number;
        bankLoanUnit?: string;
        paymentConditionValue?: number;
        paymentConditionUnit?: string;
        offerVersions?: Array<{
            key: string;
            offerBaseRateValue?: number;
            baseRateType?: string;
            baseRateUnit?: string;
            offeringPrice?: number;
            finalPrice?: number;
            finalBaseRate?: number;
        }>;
    };
    creator?: { username: string };
}

const toTitleCase = (str: string) => str ? str.replace(/\b\w/g, c => c.toUpperCase()) : '';
const toSentenceCase = (value: string) => {
    const normalized = String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
    if (!normalized) return '';
    return normalized.charAt(0).toUpperCase() + normalized.slice(1);
};
const getPartyLabel = (entry: SampleEntry) => {
    const partyNameText = toTitleCase(entry.partyName || '').trim();
    const lorryText = entry.lorryNumber ? entry.lorryNumber.toUpperCase() : '';
    if (entry.entryType === 'DIRECT_LOADED_VEHICLE') return lorryText || partyNameText || '-';
    return partyNameText || lorryText || '-';
};
const toNumberText = (value: any, digits = 2) => {
    const num = Number(value);
    return Number.isFinite(num) ? num.toFixed(digits).replace(/\.00$/, '') : '-';
};
const formatIndianCurrency = (value: any) => {
    const num = Number(value);
    return Number.isFinite(num)
        ? num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : '-';
};
const formatRateUnitLabel = (value?: string) => value === 'per_quintal'
    ? 'Per Qtl'
    : value === 'per_ton'
        ? 'Per Ton'
        : value === 'per_kg'
            ? 'Per Kg'
            : 'Per Bag';
const formatToggleUnitLabel = (value?: string) => value === 'per_quintal'
    ? 'Per Qtl'
    : value === 'percentage'
        ? '%'
        : value === 'lumps'
            ? 'Lumps'
            : value === 'per_kg'
                ? 'Per Kg'
                : 'Per Bag';
const formatShortDateTime = (value?: string | null) => {
    if (!value) return '';
    try {
        return new Date(value).toLocaleString('en-GB', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        });
    } catch {
        return '';
    }
};
const hasAlphaOrPositiveValue = (val: any) => {
    if (val === null || val === undefined || val === '') return false;
    const raw = String(val).trim();
    if (!raw) return false;
    if (/[a-zA-Z]/.test(raw)) return true;
    const num = parseFloat(raw);
    return Number.isFinite(num) && num !== 0;
};

const getResampleRoundLabel = (attempts: number) => {
    if (attempts <= 1) return '';
    return `Re-sample Round ${attempts}`;
};
const getSamplingLabel = (attemptNo: number) => {
    if (attemptNo <= 1) return '1st';
    return '2nd';
};

interface AdminSampleBook2Props {
    entryType?: string;
    excludeEntryType?: string;
}

type PricingDetailState = {
    entry: SampleEntry;
    mode: 'offer' | 'final';
};

const AdminSampleBook2: React.FC<AdminSampleBook2Props> = ({ entryType, excludeEntryType }) => {
    const isRiceBook = entryType === 'RICE_SAMPLE';
    const tableMinWidth = isRiceBook ? '100%' : '1500px';
    const [entries, setEntries] = useState<SampleEntry[]>([]);
    const [loading, setLoading] = useState(false);

    // Pagination
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [total, setTotal] = useState(0);
    const PAGE_SIZE = 100;

    // Filters
    const [filtersVisible, setFiltersVisible] = useState(false);
    const [filterDateFrom, setFilterDateFrom] = useState('');
    const [filterDateTo, setFilterDateTo] = useState('');
    const [filterBroker, setFilterBroker] = useState('');

    // Detail popup
    const [detailEntry, setDetailEntry] = useState<SampleEntry | null>(null);
    const [detailMode, setDetailMode] = useState<'summary' | 'history'>('summary');
    const [pricingDetail, setPricingDetail] = useState<PricingDetailState | null>(null);
    const [remarksPopup, setRemarksPopup] = useState<{ isOpen: boolean; text: string }>({ isOpen: false, text: '' });
    const [recheckModal, setRecheckModal] = useState<{ isOpen: boolean; entry: SampleEntry | null }>({ isOpen: false, entry: null });

    const handleRecheck = async (type: string) => {
        if (!recheckModal.entry) return;
        try {
            const token = localStorage.getItem('token');
            const response = await axios.post(`${API_URL}/sample-entries/${recheckModal.entry.id}/recheck`, { recheckType: type }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            toast.success((response.data as any).message || 'Recheck initiated successfully');
            setRecheckModal({ isOpen: false, entry: null });
            loadEntries();
        } catch (error: any) {
            console.error('Failed to initiate recheck', error);
            const msg = error.response?.data?.error || 'Failed to initiate recheck';
            toast.error(msg);
        }
    };

    useEffect(() => {
        loadEntries();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [page]);

    const loadEntries = async (fFrom?: string, fTo?: string, fBroker?: string) => {
        try {
            setLoading(true);
            const token = localStorage.getItem('token');
            const params: any = { page, pageSize: PAGE_SIZE };

            const dFrom = fFrom !== undefined ? fFrom : filterDateFrom;
            const dTo = fTo !== undefined ? fTo : filterDateTo;
            const b = fBroker !== undefined ? fBroker : filterBroker;

            if (dFrom) params.startDate = dFrom;
            if (dTo) params.endDate = dTo;
            if (b) params.broker = b;
            if (entryType) params.entryType = entryType;
            if (excludeEntryType) params.excludeEntryType = excludeEntryType;

            const response = await axios.get(`${API_URL}/sample-entries/ledger/all`, {
                params,
                headers: { Authorization: `Bearer ${token}` }
            });
            const data = response.data as any;
            setEntries(data.entries || []);
            if (data.total != null) {
                setTotal(data.total);
                setTotalPages(data.totalPages || Math.ceil(data.total / PAGE_SIZE));
            }
        } catch (error) {
            console.error('Failed to load entries', error);
        } finally {
            setLoading(false);
        }
    };

    const handleApplyFilters = () => {
        setPage(1);
        setTimeout(() => {
            loadEntries();
        }, 0);
    };

    const handleClearFilters = () => {
        setFilterDateFrom('');
        setFilterDateTo('');
        setFilterBroker('');
        setPage(1);
        setTimeout(() => {
            loadEntries('', '', '');
        }, 0);
    };

    const filteredEntries = useMemo(() => {
        if (isRiceBook) {
            return entries.filter((entry) => {
                const qp = entry.qualityParameters;
                const hasQuality = qp && qp.moisture != null && (
                    (qp.cutting1 && Number(qp.cutting1) !== 0) ||
                    (qp.bend1 && Number(qp.bend1) !== 0) ||
                    (qp.mix && String(qp.mix) !== '0') ||
                    (qp.sk && String(qp.sk) !== '0')
                );
                return !!hasQuality;
            });
        }

        return entries.filter((entry) => {
            const qp = entry.qualityParameters as any;
            const hasQualityRecord = !!(qp && (qp.reportedBy || qp.id));
            if (!hasQualityRecord) return true; // Pending entries should show
            const isPositiveNumber = (val: any) => Number.isFinite(Number(val)) && Number(val) > 0;
            const hasMoisture = qp && isPositiveNumber(qp.moisture);
            const hasGrains = qp && isPositiveNumber(qp.grainsCount);
            if (!hasMoisture || !hasGrains) return true; // Pending (partial) shows
            const hasCutting1 = qp && isPositiveNumber(qp.cutting1);
            const hasCutting2 = qp && isPositiveNumber(qp.cutting2);
            const hasBend1 = qp && isPositiveNumber(qp.bend1);
            const hasBend2 = qp && isPositiveNumber(qp.bend2);
            const hasMix = qp && (String(qp.mix || '').trim() !== '' && String(qp.mix) !== '0');
            const hasKandu = qp && (String(qp.kandu || '').trim() !== '' && String(qp.kandu) !== '0');
            const hasOil = qp && (String(qp.oil || '').trim() !== '' && String(qp.oil) !== '0');
            const hasSk = qp && (String(qp.sk || '').trim() !== '' && String(qp.sk) !== '0');
            const hasAnyDetail = hasCutting1 || hasCutting2 || hasBend1 || hasBend2 || hasMix || hasKandu || hasOil || hasSk;
            if (!hasAnyDetail) return true; // 100g completed
            const isFullQuality = hasCutting1 && hasCutting2 && hasBend1 && hasBend2 && hasMix && hasKandu && hasOil && hasSk;
            return true; // Pending (partial) shows
        });
    }, [entries, isRiceBook]);

    // Get unique brokers
    const brokersList = useMemo(() => {
        return Array.from(new Set(filteredEntries.map(e => e.brokerName))).sort();
    }, [filteredEntries]);

    // Group entries by date then broker
    const groupedEntries = useMemo(() => {
        const sorted = [...filteredEntries].sort((a, b) => {
            const dateA = new Date(a.entryDate).getTime();
            const dateB = new Date(b.entryDate).getTime();
            if (dateA !== dateB) return dateB - dateA; // Primary sort: Date DESC
            const serialA = Number.isFinite(Number(a.serialNo)) ? Number(a.serialNo) : null;
            const serialB = Number.isFinite(Number(b.serialNo)) ? Number(b.serialNo) : null;
            if (serialA !== null && serialB !== null && serialA !== serialB) return serialA - serialB;
            return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(); // Secondary sort: CreatedAt ASC for stable Sl No
        });
        const grouped: Record<string, Record<string, typeof sorted>> = {};
        sorted.forEach(entry => {
            const dateKey = new Date(entry.entryDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
            const brokerKey = entry.brokerName || 'Unknown';
            if (!grouped[dateKey]) grouped[dateKey] = {};
            if (!grouped[dateKey][brokerKey]) grouped[dateKey][brokerKey] = [];
            grouped[dateKey][brokerKey].push(entry);
        });
        return grouped;
    }, [filteredEntries]);

    // Status badge helper
    const cookingBadge = (entry: SampleEntry) => {
        const cr = entry.cookingReport;
        const d = entry.lotSelectionDecision;
        const history = Array.isArray(cr?.history) ? cr!.history : [];
        const latestEvent = history.length > 0 ? history[history.length - 1] : null;
        const doneByFromHistory = [...history].reverse().find((h) => h?.cookingDoneBy)?.cookingDoneBy || '';
        const approvedByFromHistory = [...history].reverse().find((h) => h?.approvedBy)?.approvedBy || '';
        const doneBy = cr?.cookingDoneBy || doneByFromHistory || '';
        const approvedBy = cr?.cookingApprovedBy || approvedByFromHistory || '';
        const eventDate = formatShortDateTime((latestEvent as any)?.date || null);
        const hasRemarks = !!(cr?.remarks && String(cr.remarks).trim());
        const approvals = history.filter((h) => h?.status);
        const staffAttempts = history.filter((h) => h?.cookingDoneBy && !h?.status);
        const isResampleFlow = d === 'FAIL';
        const pendingStaff = staffAttempts.length > approvals.length;
        const cookingAttempts = staffAttempts.length;
        const currentAttempt = isResampleFlow
            ? Math.min(2, (pendingStaff ? Math.max(1, approvals.length + 1) : Math.max(1, approvals.length)))
            : 1;
        const isAttemptContext =
            isResampleFlow
            && (approvals.length > 1 || cookingAttempts > 1);

        if (!isRiceBook && isAttemptContext) {
            const mapStatus = (status?: string | null) => {
                const key = String(status || '').toLowerCase();
                if (key === 'pass' || key === 'ok') return 'Pass';
                if (key === 'medium') return 'Medium';
                if (key === 'fail') return 'Fail';
                if (key === 'recheck') return 'Recheck';
                return 'Pending';
            };
            const getStyle = (label: string) => {
                if (label === 'Pass') return { bg: '#e8f5e9', color: '#2e7d32' };
                if (label === 'Medium') return { bg: '#ffe0b2', color: '#f39c12' };
                if (label === 'Fail') return { bg: '#ffcdd2', color: '#b71c1c' };
                if (label === 'Recheck') return { bg: '#e3f2fd', color: '#1565c0' };
                return { bg: '#ffe0b2', color: '#e65100' };
            };

            const firstLabel = mapStatus(approvals[0]?.status || cr?.status || null);
            const secondLabel = pendingStaff ? 'Pending' : mapStatus(approvals[1]?.status || null);
            const firstStyle = getStyle(firstLabel);
            const secondStyle = getStyle(secondLabel);
            const firstRemark = String(approvals[0]?.remarks || cr?.remarks || '').trim();

            return (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '3px', width: '100%' }}>
                    <span style={{ background: firstStyle.bg, color: firstStyle.color, padding: '1px 6px', borderRadius: '10px', fontSize: '9px', fontWeight: '700' }}>
                        {`${getSamplingLabel(1)}: ${firstLabel}`}
                    </span>
                    <span style={{ background: secondStyle.bg, color: secondStyle.color, padding: '1px 6px', borderRadius: '10px', fontSize: '9px', fontWeight: '700' }}>
                        {`${getSamplingLabel(2)}: ${secondLabel}`}
                    </span>
                    {firstRemark && (
                        <button
                            type="button"
                            onClick={() => setRemarksPopup({ isOpen: true, text: firstRemark })}
                            style={{ color: '#8e24aa', fontSize: '9px', fontWeight: '700', cursor: 'pointer', background: 'transparent', border: 'none', padding: 0 }}
                        >
                            Remarks
                        </button>
                    )}
                </div>
            );
        }

        // Pass Without Cooking = no cooking needed, show dash
        if (d === 'PASS_WITHOUT_COOKING') {
            return <span style={{ color: '#999', fontSize: '10px' }}>-</span>;
        }
        // If FAIL, show FAIL status unless there's a recheck outcome
        if (d === 'FAIL' && cr && cr.status && cr.status.toLowerCase() !== 'recheck') {
            const result = cr.status.toLowerCase();
            if (result === 'pass' || result === 'ok') { 
                return (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '3px', width: '100%' }}>
                        <span style={{ background: '#e8f5e9', color: '#2e7d32', padding: '1px 6px', borderRadius: '10px', fontSize: '9px', fontWeight: '700' }}>Recheck: Pass</span>
                        {cr.remarks && (
                            <button
                                type="button"
                                onClick={() => setRemarksPopup({ isOpen: true, text: String(cr.remarks || '') })}
                                style={{ color: '#8e24aa', fontSize: '9px', fontWeight: '700', cursor: 'pointer', background: 'transparent', border: 'none', padding: 0 }}
                            >
                                🔍 Remarks
                            </button>
                        )}
                    </div>
                );
            }
            return <span style={{ background: '#ffcdd2', color: '#b71c1c', padding: '1px 6px', borderRadius: '10px', fontSize: '9px', fontWeight: '700' }}>Fail</span>;
        }
        let result = '';
        let bg = '#f5f5f5';
        let color = '#666';
        let cleanLabel = 'Pending';
        const hasCookingOutcome = (d === 'PASS_WITH_COOKING' || d === 'SOLDOUT') && cr && cr.status;
        // Pass With Cooking + cooking report submitted = show actual result
        if (hasCookingOutcome) {
            result = cr.status.toLowerCase();
            if (result === 'pass' || result === 'ok') { bg = '#e8f5e9'; color = '#2e7d32'; cleanLabel = 'Pass'; }
            else if (result === 'medium') { bg = '#ffe0b2'; color = '#f39c12'; cleanLabel = 'Medium'; }
            else if (result === 'fail') { bg = '#ffcdd2'; color = '#b71c1c'; cleanLabel = 'Fail'; }
            else if (result === 'recheck') { bg = '#e3f2fd'; color = '#1565c0'; cleanLabel = 'Recheck'; }

            if (!isRiceBook) {
                return (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '3px', width: '100%' }}>
                        <span style={{ background: bg, color, padding: '1px 6px', borderRadius: '10px', fontSize: '9px', fontWeight: '700' }}>
                            {isAttemptContext ? `${getSamplingLabel(currentAttempt)}: ${cleanLabel}` : cleanLabel}
                        </span>
                        {result === 'recheck' && cr.remarks && (
                            <button
                                type="button"
                                onClick={() => setRemarksPopup({ isOpen: true, text: String(cr.remarks || '') })}
                                style={{ color: '#8e24aa', fontSize: '9px', fontWeight: '700', cursor: 'pointer', background: 'transparent', border: 'none', padding: 0 }}
                            >
                                🔍 Remarks
                            </button>
                        )}
                    </div>
                );
            }

            return (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '2px' }}>
                    <span style={{ background: bg, color, padding: '1px 6px', borderRadius: '10px', fontSize: '9px', fontWeight: '700' }}>
                        {isAttemptContext ? `${getSamplingLabel(currentAttempt)}: ${cleanLabel}` : cleanLabel}
                    </span>
                    {doneBy && <span style={{ fontSize: '9px', color: '#4e342e', fontWeight: '700' }}>Done: {toTitleCase(doneBy)}</span>}
                    {approvedBy && <span style={{ fontSize: '9px', color: '#0d47a1', fontWeight: '700' }}>Appr: {toTitleCase(approvedBy)}</span>}
                    {eventDate && <span style={{ fontSize: '9px', color: '#616161' }}>{eventDate}</span>}
                    {hasRemarks && (
                        <button
                            type="button"
                            onClick={() => setRemarksPopup({ isOpen: true, text: String(cr.remarks || '') })}
                            style={{ color: '#8e24aa', fontSize: '9px', fontWeight: '700', cursor: 'pointer', background: 'transparent', border: 'none', padding: 0 }}
                        >
                            Remarks
                        </button>
                    )}
                </div>
            );
        }
    };

    const statusBadge = (entry: SampleEntry) => {
        const s = entry.workflowStatus;
        const d = entry.lotSelectionDecision;
        const cr = entry.cookingReport;
        const resampleAttempts = Math.max(0, Number(entry.qualityReportAttempts || 0));
        const cookingStatusKey = String(cr?.status || '').toUpperCase();
        const isCookingPassed = cookingStatusKey === 'PASS' || cookingStatusKey === 'MEDIUM';
        const isRecheckRequested = (entry as any).recheckRequested === true;
        const isResampleInProgress = d === 'FAIL' && s !== 'FAILED' && !isCookingPassed && !entry.offering?.finalPrice && !isRecheckRequested;
        const showResampleRound = resampleAttempts > 1 && isResampleInProgress;
        const userStr = localStorage.getItem('user');
        let userRole = '';
        try { 
            const u = userStr ? JSON.parse(userStr) : null; 
            userRole = String(u?.role || '').toLowerCase(); 
        } catch { 
            userRole = ''; 
        }
        const canRecheck = ['admin', 'manager', 'owner', 'owner_financial'].includes(userRole);

        let label = 'Pending';
        let bg = '#ffe0b2';
        let color = '#e65100';
        // Resample in-progress only while current resample cycle is not yet passed/finalized
        if (d === 'SOLDOUT') { bg = '#800000'; color = '#ffffff'; label = 'Sold Out'; }
        else if (isRecheckRequested) { bg = '#e3f2fd'; color = '#1565c0'; label = 'Rechecking'; }
        else if (d === 'FAIL') { bg = '#ffcdd2'; color = '#b71c1c'; label = 'Fail'; }
        else if (s === 'FAILED') { bg = '#ffcdd2'; color = '#b71c1c'; label = 'Fail'; }
        else if (isResampleInProgress) { bg = '#fff3e0'; color = '#e65100'; label = 'Re-sample Pending'; }
        else if ((d === 'PASS_WITH_COOKING' || d === 'SOLDOUT') && cr && cr.status) {
            const result = cr.status.toLowerCase();
            if (result === 'pass' || result === 'ok') {
                // Check if only 100-Gms quality data — show "100-Gms Passed"
                const qp = entry.qualityParameters;
                const hasFullQuality = qp && (
                    (qp.cutting1 && Number(qp.cutting1) !== 0)
                    || (qp.bend1 && Number(qp.bend1) !== 0)
                    || hasAlphaOrPositiveValue(qp.mix)
                    || hasAlphaOrPositiveValue(qp.mixS)
                    || hasAlphaOrPositiveValue(qp.mixL)
                );
                if (qp && qp.moisture != null && !hasFullQuality) { bg = '#e8f5e9'; color = '#2e7d32'; label = '100-Gms/Pass'; }
                else { bg = '#e8f5e9'; color = '#2e7d32'; label = 'Pass'; }
            }
            else if (result === 'fail') { bg = '#ffcdd2'; color = '#b71c1c'; label = 'Fail'; }
            else if (result === 'recheck') { bg = '#ffe0b2'; color = '#e65100'; label = 'Pending'; }
            else if (result === 'medium') {
                bg = '#e8f5e9'; color = '#2e7d32'; label = 'Pass';
            }
        }
        else if (s === 'COMPLETED' && entry.offering?.finalPrice) { bg = '#800000'; color = '#ffffff'; label = 'Sold Out'; }
        else if (entry.offering?.finalPrice) { bg = '#e8f5e9'; color = '#2e7d32'; label = 'Pass'; }
        else if (d === 'PASS_WITHOUT_COOKING') { bg = '#e8f5e9'; color = '#2e7d32'; label = 'Pass'; }
        else { bg = '#ffe0b2'; color = '#e65100'; label = 'Pending'; }
        return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}>
                {showResampleRound && (
                    <span
                        title={`This paddy lot reached quality attempt ${resampleAttempts}`}
                        style={{ fontSize: '9px', padding: '2px 6px', borderRadius: '10px', backgroundColor: '#ffedd5', color: '#7c2d12', fontWeight: '700', whiteSpace: 'nowrap' as const, border: '1px solid #fdba74' }}
                    >
                        {getResampleRoundLabel(resampleAttempts)}
                    </span>
                )}
                <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '10px', backgroundColor: bg, color, fontWeight: '600', whiteSpace: 'nowrap' as const }}>{label}</span>
                <div style={{ display: 'flex', gap: '3px' }}>
                    <button 
                        onClick={(e) => { e.stopPropagation(); setDetailMode('history'); setDetailEntry(entry); }}
                        style={{ fontSize: '8px', padding: '1px 4px', background: '#27ae60', color: 'white', border: 'none', borderRadius: '3px', cursor: 'pointer', fontWeight: '600' }}
                    >
                        View
                    </button>
                    {canRecheck && (
                        <button 
                            onClick={(e) => { 
                                e.stopPropagation(); 
                                if (entry.workflowStatus === 'COMPLETED') {
                                    toast.error('Recheck is not allowed for finalized/completed lots');
                                    return;
                                }
                                setRecheckModal({ isOpen: true, entry }); 
                            }}
                            style={{ fontSize: '8px', padding: '1px 4px', background: '#3498db', color: 'white', border: 'none', borderRadius: '3px', cursor: 'pointer', fontWeight: '600' }}
                        >
                            Recheck
                        </button>
                    )}
                </div>
            </div>
        );
    };

    const qualityBadge = (entry: SampleEntry) => {
        const attemptDetails = (entry as any).qualityAttemptDetails || [];
        const attemptsSorted = attemptDetails.length > 0
            ? [...attemptDetails].sort((a: any, b: any) => (a.attemptNo || 0) - (b.attemptNo || 0))
            : (entry.qualityParameters ? [entry.qualityParameters] : []);
        const attemptsCount = attemptsSorted.length > 0 ? attemptsSorted.length : Math.max(0, Number(entry.qualityReportAttempts || 0));
        const latestAttempt = attemptsSorted.length > 0 ? attemptsSorted[attemptsSorted.length - 1] : null;
        const d = entry.lotSelectionDecision;
        const isRecheckRequested = (entry as any).recheckRequested === true;

        const getQualityType = (attempt: any) => {
            if (!attempt) return 'Pending';
            const hasFullQuality = (attempt.cutting1 && Number(attempt.cutting1) !== 0)
                || (attempt.bend1 && Number(attempt.bend1) !== 0)
                || hasAlphaOrPositiveValue(attempt.mix)
                || hasAlphaOrPositiveValue(attempt.mixS)
                || hasAlphaOrPositiveValue(attempt.mixL);
            const has100g = attempt.grainsCount != null && Number(attempt.grainsCount) !== 0;
            if (hasFullQuality) return 'Done';
            if (has100g) return '100-Gms';
            return 'Pending';
        };

        const getLatestStatus = (attempt: any) => {
            if (!attempt) return 'Pending';
            const hasFullQuality = (attempt.cutting1 && Number(attempt.cutting1) !== 0)
                || (attempt.bend1 && Number(attempt.bend1) !== 0)
                || hasAlphaOrPositiveValue(attempt.mix)
                || hasAlphaOrPositiveValue(attempt.mixS)
                || hasAlphaOrPositiveValue(attempt.mixL);
            const has100g = attempt.grainsCount != null && Number(attempt.grainsCount) !== 0;
            const isPass = d === 'PASS_WITH_COOKING'
                || d === 'PASS_WITHOUT_COOKING'
                || d === 'SOLDOUT'
                || (attemptsCount > 1 && (hasFullQuality || has100g));
            if (isPass) return 'Pass';
            if (isRecheckRequested) return 'Rechecking';
            if (d === 'FAIL') return 'Fail';
            return 'Pending';
        };

        if (attemptsCount > 1 && attemptsSorted.length > 0) {
            const lastStatus = getLatestStatus(latestAttempt);
            return (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '4px' }}>
                    {attemptsSorted.map((attempt: any, idx: number) => {
                        const attemptNo = idx + 1;
                        const label = attemptNo === 1 ? '1st' : attemptNo === 2 ? '2nd' : attemptNo === 3 ? '3rd' : `${attemptNo}th`;
                        const isLast = idx === attemptsSorted.length - 1;
                        const qualityType = getQualityType(attempt);
                        const statusLabel = isLast ? lastStatus : 'Fail';
                        const typeStyle = qualityType === 'Done'
                            ? { bg: '#c8e6c9', color: '#2e7d32' }
                            : qualityType === '100-Gms'
                                ? { bg: '#fff8e1', color: '#f57f17' }
                                : { bg: '#f5f5f5', color: '#666' };
                        const statusStyle = statusLabel === 'Pass'
                            ? { bg: '#a5d6a7', color: '#1b5e20' }
                            : statusLabel === 'Rechecking'
                                ? { bg: '#e3f2fd', color: '#1565c0' }
                                : statusLabel === 'Fail'
                                    ? { bg: '#ffcdd2', color: '#b71c1c' }
                                    : { bg: '#ffe0b2', color: '#e65100' };
                        return (
                            <div key={`${entry.id}-attempt-${attemptNo}`} style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                <span style={{ fontSize: '9px', fontWeight: '700', color: '#555', minWidth: '34px' }}>{label}:</span>
                                <span style={{ background: typeStyle.bg, color: typeStyle.color, padding: '2px 6px', borderRadius: '10px', fontSize: '9px', fontWeight: '700' }}>{qualityType}</span>
                                <span style={{ background: statusStyle.bg, color: statusStyle.color, padding: '2px 6px', borderRadius: '10px', fontSize: '9px', fontWeight: '700' }}>{statusLabel}</span>
                            </div>
                        );
                    })}
                </div>
            );
        }

        if (attemptsSorted.length > 0) {
            const attempt = attemptsSorted[attemptsSorted.length - 1];
            const qualityType = getQualityType(attempt);
            const statusLabel = getLatestStatus(attempt);
            const typeStyle = qualityType === 'Done'
                ? { bg: '#c8e6c9', color: '#2e7d32' }
                : qualityType === '100-Gms'
                    ? { bg: '#fff8e1', color: '#f57f17' }
                    : { bg: '#f5f5f5', color: '#666' };
            const statusStyle = statusLabel === 'Pass'
                ? { bg: '#a5d6a7', color: '#1b5e20' }
                : statusLabel === 'Rechecking'
                    ? { bg: '#e3f2fd', color: '#1565c0' }
                    : statusLabel === 'Fail'
                        ? { bg: '#ffcdd2', color: '#b71c1c' }
                        : { bg: '#ffe0b2', color: '#e65100' };
            return (
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <span style={{ background: typeStyle.bg, color: typeStyle.color, padding: '2px 6px', borderRadius: '10px', fontSize: '9px', fontWeight: '700' }}>{qualityType}</span>
                    <span style={{ background: statusStyle.bg, color: statusStyle.color, padding: '2px 6px', borderRadius: '10px', fontSize: '9px', fontWeight: '700' }}>{statusLabel}</span>
                </div>
            );
        }

        return <div style={{ display: 'flex', justifyContent: 'flex-start', alignItems: 'center' }}><span style={{ background: '#f5f5f5', color: '#c62828', padding: '2px 6px', borderRadius: '10px', fontSize: '9px' }}>Pending</span></div>;
    };

    const getChargeText = (value?: number, unit?: string) => {
        if (value === null || value === undefined || Number(value) === 0) return '-';
        return `${toNumberText(value)} / ${formatToggleUnitLabel(unit)}`;
    };

    const getOfferRateText = (offering?: SampleEntry['offering']) => {
        if (!offering) return '-';
        const rateValue = offering.offerBaseRateValue ?? offering.offeringPrice;
        if (!rateValue) return '-';
        const typeText = offering.baseRateType ? offering.baseRateType.replace(/_/g, '/') : '-';
        return `Rs ${toNumberText(rateValue)} / ${typeText} / ${formatRateUnitLabel(offering.baseRateUnit)}`;
    };

    const getFinalRateText = (offering?: SampleEntry['offering']) => {
        if (!offering) return '-';
        const rateValue = offering.finalPrice ?? offering.finalBaseRate;
        if (!rateValue) return '-';
        const typeText = offering.baseRateType ? offering.baseRateType.replace(/_/g, '/') : '-';
        return `Rs ${toNumberText(rateValue)} / ${typeText} / ${formatRateUnitLabel(offering.baseRateUnit)}`;
    };

    const getPricingRows = (offering: NonNullable<SampleEntry['offering']>, mode: 'offer' | 'final') => {
        const isFinalMode = mode === 'final';
        const suteValue = isFinalMode ? offering.finalSute : offering.sute;
        const suteUnit = isFinalMode ? offering.finalSuteUnit : offering.suteUnit;

        return [
            [isFinalMode ? 'Final Rate' : 'Offer Rate', isFinalMode ? getFinalRateText(offering) : getOfferRateText(offering)],
            ['Sute', suteValue ? `${toNumberText(suteValue)} / ${formatRateUnitLabel(suteUnit)}` : '-'],
            ['Moisture', offering.moistureValue ? `${toNumberText(offering.moistureValue)}%` : '-'],
            ['Hamali', getChargeText(offering.hamali, offering.hamaliUnit)],
            ['Brokerage', getChargeText(offering.brokerage, offering.brokerageUnit)],
            ['LF', getChargeText(offering.lf, offering.lfUnit)],
            ['EGB', offering.egbType === 'mill'
                ? '0 / Mill'
                : offering.egbType === 'purchase' && offering.egbValue !== undefined && offering.egbValue !== null
                    ? `${toNumberText(offering.egbValue)} / Purchase`
                    : '-'],
            ['CD', offering.cdEnabled
                ? offering.cdValue
                    ? `${toNumberText(offering.cdValue)} / ${formatToggleUnitLabel(offering.cdUnit)}`
                    : 'Pending'
                : '-'],
            ['Bank Loan', offering.bankLoanEnabled
                ? offering.bankLoanValue
                    ? `Rs ${formatIndianCurrency(offering.bankLoanValue)} / ${formatToggleUnitLabel(offering.bankLoanUnit)}`
                    : 'Pending'
                : '-'],
            ['Payment', offering.paymentConditionValue
                ? `${offering.paymentConditionValue} ${offering.paymentConditionUnit === 'month' ? 'Month' : 'Days'}`
                : '-']
        ];
    };



    return (
        <div>
            {/* Filter Bar */}
            <div style={{ marginBottom: '0px' }}>
                <button onClick={() => setFiltersVisible(!filtersVisible)}
                    style={{ padding: '7px 16px', backgroundColor: filtersVisible ? '#e74c3c' : '#3498db', color: 'white', border: 'none', borderRadius: '4px', fontSize: '12px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {filtersVisible ? '✕ Hide Filters' : '🔍 Filters'}
                </button>
                {filtersVisible && (
                    <div style={{ display: 'flex', gap: '12px', marginTop: '8px', alignItems: 'flex-end', flexWrap: 'wrap', backgroundColor: '#fff', padding: '10px 14px', borderRadius: '6px', border: '1px solid #e0e0e0' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#555', marginBottom: '3px' }}>From Date</label>
                            <input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} style={{ padding: '5px 8px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '12px' }} />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#555', marginBottom: '3px' }}>To Date</label>
                            <input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} style={{ padding: '5px 8px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '12px' }} />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#555', marginBottom: '3px' }}>Broker</label>
                            <select value={filterBroker} onChange={e => setFilterBroker(e.target.value)} style={{ padding: '5px 8px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '12px', minWidth: '140px', backgroundColor: 'white' }}>
                                <option value="">All Brokers</option>
                                {brokersList.map((b, i) => <option key={i} value={b}>{b}</option>)}
                            </select>
                        </div>
                        {(filterDateFrom || filterDateTo || filterBroker) && (
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <button onClick={handleApplyFilters} style={{ padding: '5px 12px', border: 'none', borderRadius: '4px', backgroundColor: '#3498db', color: 'white', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>Apply</button>
                                <button onClick={handleClearFilters}
                                    style={{ padding: '5px 12px', border: '1px solid #e74c3c', borderRadius: '4px', backgroundColor: '#fff', color: '#e74c3c', fontSize: '11px', fontWeight: '600', cursor: 'pointer' }}>
                                    Clear Filters
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Entries grouped by Date → Broker */}
            <div style={{ overflowX: 'auto', backgroundColor: 'white', border: '1px solid #ddd' }}>
                {loading ? (
                    <div style={{ textAlign: 'center', padding: '20px', color: '#666' }}>Loading...</div>
                ) : Object.keys(groupedEntries).length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '20px', color: '#999' }}>No entries found</div>
                ) : (
                    Object.entries(groupedEntries).map(([dateKey, brokerGroups]) => {
                        let brokerSeq = 0;
                        return (
                            <div key={dateKey} style={{ marginBottom: '20px' }}>
                                {Object.entries(brokerGroups).sort(([a], [b]) => a.localeCompare(b)).map(([brokerName, brokerEntries], brokerIdx) => {
                                    let slNo = 0;
                                    const orderedEntries = [...brokerEntries].sort((a, b) => {
                                        const serialA = Number.isFinite(Number(a.serialNo)) ? Number(a.serialNo) : null;
                                        const serialB = Number.isFinite(Number(b.serialNo)) ? Number(b.serialNo) : null;
                                        if (serialA !== null && serialB !== null && serialA !== serialB) return serialA - serialB;
                                        return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
                                    });
                                    brokerSeq++;
                                    return (
                                        <div key={brokerName} style={{ marginBottom: '12px' }}>
                                            {/* Date + Paddy Sample bar — only first broker */}
                                            {brokerIdx === 0 && <div style={{
                                                background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
                                                color: 'white', padding: '6px 10px', fontWeight: '700', fontSize: '14px',
                                                textAlign: 'center', letterSpacing: '0.5px', minWidth: tableMinWidth
                                            }}>
                                                {(() => { const d = new Date(brokerEntries[0]?.entryDate); return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`; })()}
                                                &nbsp;&nbsp;{entryType === 'RICE_SAMPLE' ? 'Rice Sample' : 'Paddy Sample'}
                                            </div>}
                                            {/* Broker name bar */}
                                            <div style={{
                                                background: '#e8eaf6',
                                                color: '#000', padding: '3px 10px', fontWeight: '700', fontSize: '12px',
                                                display: 'flex', alignItems: 'center', gap: '4px', borderBottom: '1px solid #c5cae9', minWidth: tableMinWidth
                                            }}>
                                                <span style={{ fontSize: '12px', fontWeight: '800' }}>{brokerSeq}.</span> {toTitleCase(brokerName)}
                                            </div>
                                            {/* Table */}
                                            <table style={{ width: '100%', minWidth: tableMinWidth, borderCollapse: 'collapse', fontSize: '11px', tableLayout: 'fixed', border: '1px solid #000' }}>
                                                <thead>
                                                    <tr style={{ backgroundColor: entryType === 'RICE_SAMPLE' ? '#4a148c' : '#1a237e', color: 'white' }}>
                                                        <th style={{ border: '1px solid #000', padding: '3px 4px', fontWeight: '600', fontSize: '13px', textAlign: 'center', whiteSpace: 'nowrap', width: '3.5%' }}>SL No</th>
                                                        {!isRiceBook && <th style={{ border: '1px solid #000', padding: '3px 4px', fontWeight: '600', fontSize: '13px', textAlign: 'center', whiteSpace: 'nowrap', width: '4%' }}>Type</th>}
                                                        <th style={{ border: '1px solid #000', padding: '3px 4px', fontWeight: '600', fontSize: '13px', textAlign: 'center', whiteSpace: 'nowrap', width: '4%' }}>Bags</th>
                                                        <th style={{ border: '1px solid #000', padding: '3px 4px', fontWeight: '600', fontSize: '13px', textAlign: 'center', whiteSpace: 'nowrap', width: '4%' }}>Pkg</th>
                                                        <th style={{ border: '1px solid #000', padding: '3px 4px', fontWeight: '600', fontSize: '13px', textAlign: 'left', whiteSpace: 'nowrap', width: '12%' }}>Party Name</th>
                                                        <th style={{ border: '1px solid #000', padding: '3px 4px', fontWeight: '600', fontSize: '13px', textAlign: 'left', whiteSpace: 'nowrap', width: '12%' }}>{entryType === 'RICE_SAMPLE' ? 'Rice Location' : 'Paddy Location'}</th>
                                                        <th style={{ border: '1px solid #000', padding: '3px 4px', fontWeight: '600', fontSize: '13px', textAlign: 'left', whiteSpace: 'nowrap', width: '9%' }}>Variety</th>
                                                        <th style={{ border: '1px solid #000', padding: '3px 4px', fontWeight: '600', fontSize: '13px', textAlign: 'left', whiteSpace: 'nowrap', width: '12%' }}>Sample Collected By</th>
                                                        <th style={{ border: '1px solid #000', padding: '3px 4px', fontWeight: '600', fontSize: '13px', textAlign: 'left', whiteSpace: 'nowrap', width: '11%' }}>Quality Report</th>
                                                        <th style={{ border: '1px solid #000', padding: '3px 4px', fontWeight: '600', fontSize: '13px', textAlign: 'center', whiteSpace: 'nowrap', width: isRiceBook ? '12%' : '8.5%' }}>Cooking Report</th>
                                                        <th style={{ border: '1px solid #000', padding: '3px 4px', fontWeight: '600', fontSize: '13px', textAlign: 'center', whiteSpace: 'nowrap', width: '7%' }}>Offer</th>
                                                        <th style={{ border: '1px solid #000', padding: '3px 4px', fontWeight: '600', fontSize: '13px', textAlign: 'center', whiteSpace: 'nowrap', width: '6%' }}>Final</th>
                                                        <th style={{ border: '1px solid #000', padding: '3px 4px', fontWeight: '600', fontSize: '13px', textAlign: 'center', whiteSpace: 'nowrap', width: '8.5%' }}>Status</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {orderedEntries.map((entry, idx) => {
                                                        slNo++;
                                                        const qp = entry.qualityParameters;
                                                        const cr = entry.cookingReport;
                                                        const cookingFail = entry.lotSelectionDecision === 'PASS_WITH_COOKING' && cr && cr.status && cr.status.toLowerCase() === 'fail';
                                                        const cookingStatusKey = String(cr?.status || '').toUpperCase();
                                                        const isResampleRow =
                                                            entry.lotSelectionDecision === 'FAIL'
                                                            && entry.workflowStatus !== 'FAILED'
                                                            && !['PASS', 'MEDIUM'].includes(cookingStatusKey)
                                                            && !entry.offering?.finalPrice;
                                                        const rowBg = isResampleRow
                                                            ? '#fff3e0'
                                                            : cookingFail
                                                                ? '#fff0f0'
                                                                : entry.entryType === 'DIRECT_LOADED_VEHICLE' ? '#e3f2fd' : entry.entryType === 'LOCATION_SAMPLE' ? '#ffe0b2' : '#ffffff';

                                                        const fallback = entryType === 'RICE_SAMPLE' ? '--' : '-';
                                                        const fmtVal = (v: any, forceDecimal = false, precision = 2) => {
                                                            if (v == null || v === '') return fallback;
                                                            const n = Number(v);
                                                            if (isNaN(n) || n === 0) return fallback;
                                                            if (forceDecimal) return n.toFixed(1);
                                                            if (precision > 2) return String(parseFloat(n.toFixed(precision)));
                                                            return n % 1 === 0 ? String(Math.round(n)) : String(parseFloat(n.toFixed(2)));
                                                        };
                                                        const hasFullQuality = qp && (
                                                            (qp.cutting1 && Number(qp.cutting1) !== 0)
                                                            || (qp.bend1 && Number(qp.bend1) !== 0)
                                                            || hasAlphaOrPositiveValue(qp.mix)
                                                            || hasAlphaOrPositiveValue(qp.mixS)
                                                            || hasAlphaOrPositiveValue(qp.mixL)
                                                        );
                                                        return (
                                                            <tr key={entry.id} style={{ backgroundColor: rowBg }}>
                                                                <td style={{ border: '1px solid #000', padding: '3px 4px', fontSize: '13px', fontWeight: '600', textAlign: 'center', whiteSpace: 'nowrap' }}>{slNo}</td>
                                                                {!isRiceBook && (
                                                                    <td style={{ border: '1px solid #000', padding: '3px 4px', fontSize: '13px', fontWeight: '700', textAlign: 'center', whiteSpace: 'nowrap' }}>
                                                                        {entry.entryType === 'LOCATION_SAMPLE' ? 'LS' : entry.entryType === 'DIRECT_LOADED_VEHICLE' ? 'RL' : 'MS'}
                                                                    </td>
                                                                )}
                                                                <td style={{ border: '1px solid #000', padding: '3px 4px', fontSize: '13px', fontWeight: '700', textAlign: 'center', whiteSpace: 'nowrap' }}>{entry.bags || '0'}</td>
                                                                <td style={{ border: '1px solid #000', padding: '3px 4px', fontSize: '13px', textAlign: 'center', whiteSpace: 'nowrap' }}>{Number(entry.packaging) === 0 ? 'Loose' : `${entry.packaging || '75'} kg`}</td>
                                                                <td style={{ border: '1px solid #000', padding: '3px 4px', fontSize: '14px', cursor: 'pointer', color: '#1565c0', fontWeight: '600', textAlign: 'left', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                                                                    onClick={() => { setDetailMode('summary'); setDetailEntry(entry); }}>
                                                                    {getPartyLabel(entry)}
                                                                </td>
                                                                 <td style={{ border: '1px solid #000', padding: '3px 4px', fontSize: '13px', textAlign: 'left', whiteSpace: 'nowrap' }}>
                                                                    {toTitleCase(entry.location) || '-'}
                                                                    {entry.entryType === 'LOCATION_SAMPLE' && (entry as any).gpsCoordinates && (() => {
                                                                        const gps = (entry as any).gpsCoordinates;
                                                                        const query = typeof gps === 'object' ? `${gps.lat},${gps.lng}` : gps;
                                                                        return (
                                                                            <a 
                                                                                href={`https://www.google.com/maps/search/?api=1&query=${query}`}
                                                                                target="_blank"
                                                                                rel="noopener noreferrer"
                                                                                title="View on Map"
                                                                                style={{ marginLeft: '4px', textDecoration: 'none', fontSize: '14px' }}
                                                                            >
                                                                                📍
                                                                            </a>
                                                                        );
                                                                    })()}
                                                                </td>
                                                                <td style={{ border: '1px solid #000', padding: '3px 4px', fontSize: '13px', textAlign: 'left', whiteSpace: 'nowrap' }}>{toTitleCase(entry.variety)}</td>
                                                                <td style={{ border: '1px solid #000', padding: '3px 4px', fontSize: '13px', textAlign: 'left', whiteSpace: 'nowrap' }}>
                                                                    {entry.sampleCollectedBy ? (<span style={{ color: '#333', fontSize: '13px', fontWeight: '600' }}>{toTitleCase(entry.sampleCollectedBy)}</span>) : entry.creator?.username ? (<span style={{ fontWeight: '600', color: '#1565c0', fontSize: '13px' }}>{toTitleCase(entry.creator.username)}</span>) : '-'}
                                                                </td>
                                                                <td style={{ border: '1px solid #000', padding: '3px 4px', textAlign: 'left', whiteSpace: 'nowrap' }}>{qualityBadge(entry)}</td>
                                                                <td style={{
                                                                    border: '1px solid #000',
                                                                    padding: '3px 4px',
                                                                    fontSize: '11px',
                                                                    textAlign: isRiceBook ? 'left' : 'center',
                                                                    whiteSpace: 'normal',
                                                                    lineHeight: '1.2',
                                                                    verticalAlign: 'middle',
                                                                    minWidth: isRiceBook ? undefined : '104px'
                                                                }}>
                                                                    {cookingBadge(entry)}
                                                                </td>
                                                                <td
                                                                    onClick={() => entry.offering?.offerBaseRateValue || entry.offering?.offeringPrice || entry.offering?.offerVersions?.length ? setPricingDetail({ entry, mode: 'offer' }) : null}
                                                                    style={{ border: '1px solid #000', padding: '3px 4px', fontSize: '11px', textAlign: 'center', whiteSpace: 'normal', wordBreak: 'break-word', overflowWrap: 'anywhere', minWidth: '116px', cursor: entry.offering?.offerBaseRateValue || entry.offering?.offeringPrice || entry.offering?.offerVersions?.length ? 'pointer' : 'default' }}
                                                                >
                                                                    {entry.offering?.offerVersions && entry.offering.offerVersions.length > 0 ? (
                                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', alignItems: 'center', width: '100%' }}>
                                                                            {entry.offering.offerVersions.map((ov, idx) => (
                                                                                <span key={idx} style={{ fontWeight: '700', color: '#1565c0', fontSize: '10px' }}>
                                                                                    {ov.key}: Rs {toNumberText(ov.offerBaseRateValue || ov.offeringPrice || 0)}
                                                                                </span>
                                                                            ))}
                                                                        </div>
                                                                    ) : entry.offering?.offerBaseRateValue ? (
                                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', alignItems: 'center', width: '100%' }}>
                                                                            <span style={{ fontWeight: '700', color: '#1565c0', fontSize: '11px' }}>Rs {toNumberText(entry.offering.offerBaseRateValue)}</span>
                                                                            <span style={{ fontSize: '9px', color: '#5f6368', fontWeight: '700', whiteSpace: 'normal', wordBreak: 'break-word', overflowWrap: 'anywhere', lineHeight: '1.2' }}>{(entry.offering.baseRateType || '').replace(/_/g, '/')} / {formatRateUnitLabel(entry.offering.baseRateUnit)}</span>
                                                                        </div>
                                                                    ) : entry.offering?.offeringPrice ? (
                                                                        <span style={{ fontWeight: '700', color: '#1565c0', fontSize: '11px' }}>Rs {toNumberText(entry.offering.offeringPrice)}</span>
                                                                    ) : '-'}
                                                                </td>
                                                                <td
                                                                    onClick={() => entry.offering?.finalPrice || entry.offering?.finalBaseRate || (entry.offering?.offerVersions?.some(ov => ov.finalPrice || ov.finalBaseRate)) ? setPricingDetail({ entry, mode: 'final' }) : null}
                                                                    style={{ border: '1px solid #000', padding: '3px 4px', fontSize: '11px', textAlign: 'center', whiteSpace: 'normal', wordBreak: 'break-word', overflowWrap: 'anywhere', minWidth: '104px', cursor: entry.offering?.finalPrice || entry.offering?.finalBaseRate || (entry.offering?.offerVersions?.some(ov => ov.finalPrice || ov.finalBaseRate)) ? 'pointer' : 'default' }}
                                                                >
                                                                    {entry.offering?.offerVersions && entry.offering.offerVersions.length > 0 && entry.offering.offerVersions.some(ov => ov.finalPrice || ov.finalBaseRate) ? (
                                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', alignItems: 'center', width: '100%' }}>
                                                                            {entry.offering.offerVersions.filter(ov => ov.finalPrice || ov.finalBaseRate).map((ov, idx) => (
                                                                                <span key={idx} style={{ fontWeight: '700', color: '#2e7d32', fontSize: '10px' }}>
                                                                                    {ov.key}: Rs {toNumberText(ov.finalPrice || ov.finalBaseRate || 0)}
                                                                                </span>
                                                                            ))}
                                                                        </div>
                                                                    ) : entry.offering?.finalPrice ? (
                                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', alignItems: 'center', width: '100%' }}>
                                                                            <span style={{ fontWeight: '700', color: '#2e7d32', fontSize: '11px' }}>Rs {toNumberText(entry.offering.finalPrice)}</span>
                                                                            <span style={{ fontSize: '9px', color: '#5f6368', fontWeight: '700', whiteSpace: 'normal', wordBreak: 'break-word', overflowWrap: 'anywhere', lineHeight: '1.2' }}>{(entry.offering.baseRateType || '').replace(/_/g, '/')} / {formatRateUnitLabel(entry.offering.baseRateUnit)}</span>
                                                                        </div>
                                                                    ) : entry.offering?.finalBaseRate ? (
                                                                        <span style={{ fontWeight: '700', color: '#2e7d32', fontSize: '11px' }}>Rs {toNumberText(entry.offering.finalBaseRate)}</span>
                                                                    ) : '-'}
                                                                </td>
                                                                <td style={{ border: '1px solid #000', padding: '3px 4px', textAlign: 'center', whiteSpace: 'normal', minWidth: '108px' }}>{statusBadge(entry)}</td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    );
                                })}
                            </div>
                        );
                    })
                )}
            </div>

            {/* Recheck Modal */}
            {recheckModal.isOpen && recheckModal.entry && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 10001 }}>
                    <div style={{ backgroundColor: 'white', borderRadius: '8px', width: '360px', padding: '20px', boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }}>
                        <h3 style={{ margin: '0 0 16px', fontSize: '16px', fontWeight: '800', color: '#1a237e' }}>Initiate Recheck</h3>
                        <p style={{ fontSize: '13px', color: '#666', marginBottom: '20px' }}>
                            Select the type of recheck for <strong>{getPartyLabel(recheckModal.entry)}</strong>:
                        </p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            <button onClick={() => handleRecheck('quality')} style={{ padding: '10px', backgroundColor: '#e67e22', color: 'white', border: 'none', borderRadius: '6px', fontWeight: '700', cursor: 'pointer' }}>Quality Parameters Recheck</button>
                            <button onClick={() => handleRecheck('cooking')} style={{ padding: '10px', backgroundColor: '#3498db', color: 'white', border: 'none', borderRadius: '6px', fontWeight: '700', cursor: 'pointer' }}>Cooking Report Recheck</button>
                            <button onClick={() => handleRecheck('both')} style={{ padding: '10px', backgroundColor: '#8e44ad', color: 'white', border: 'none', borderRadius: '6px', fontWeight: '700', cursor: 'pointer' }}>Both (Quality & Cooking)</button>
                        </div>
                        <button onClick={() => setRecheckModal({ isOpen: false, entry: null })} style={{ marginTop: '16px', width: '100%', padding: '8px', backgroundColor: '#eee', color: '#666', border: 'none', borderRadius: '6px', fontWeight: '600', cursor: 'pointer' }}>Cancel</button>
                    </div>
                </div>
            )}

            {/* Detail Popup — same design as AdminSampleBook */}
            {
                detailEntry && (
                    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999 }}
                        onClick={() => setDetailEntry(null)}>
                        <div style={{ backgroundColor: 'white', borderRadius: '8px', width: detailMode === 'history' ? '85vw' : '500px', maxWidth: detailMode === 'history' ? '88vw' : '90vw', maxHeight: detailMode === 'history' ? '82vh' : '80vh', overflowY: 'auto', overflowX: detailMode === 'history' ? 'auto' : 'hidden', boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }}
                            onClick={e => e.stopPropagation()}>
                            {/* Redesigned Header — Green Background, Aligned Items */}
                            <div style={{
                                background: detailEntry.entryType === 'DIRECT_LOADED_VEHICLE'
                                    ? '#1565c0'
                                    : detailEntry.entryType === 'LOCATION_SAMPLE'
                                        ? '#e67e22'
                                        : '#4caf50',
                                padding: '16px 20px', borderRadius: '8px 8px 0 0', color: 'white',
                                position: 'relative'
                            }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', marginBottom: '4px' }}>
                                    <div style={{ fontSize: '13px', fontWeight: '800', opacity: 0.9, textAlign: 'left' }}>
                                        {new Date(detailEntry.entryDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}
                                    </div>
                                    <div style={{ fontSize: '18px', fontWeight: '900', letterSpacing: '1.5px', textTransform: 'uppercase', textAlign: 'center' }}>
                                        {detailEntry.entryType === 'DIRECT_LOADED_VEHICLE' ? 'Ready Lorry' : detailEntry.entryType === 'LOCATION_SAMPLE' ? 'Location Sample' : 'Mill Sample'}
                                    </div>
                                    <div></div>
                                </div>
                                <div style={{
                                    fontSize: '28px', fontWeight: '900', letterSpacing: '-0.5px', marginTop: '4px',
                                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '85%'
                                }}>
                                    {toTitleCase(detailEntry.brokerName) || '-'}
                                </div>
                                <button onClick={() => setDetailEntry(null)} style={{
                                    position: 'absolute', top: '16px', right: '16px',
                                    background: 'rgba(255,255,255,0.25)', border: 'none', borderRadius: '50%',
                                    width: '32px', height: '32px', cursor: 'pointer', fontSize: '16px',
                                    color: 'white', fontWeight: '900', display: 'flex', alignItems: 'center',
                                    justifyContent: 'center', transition: 'all 0.2s',
                                    boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
                                }}>✕</button>
                            </div>
                            <div style={{ padding: '24px', backgroundColor: '#fff', borderBottomLeftRadius: '10px', borderBottomRightRadius: '10px', minWidth: detailMode === 'history' ? '1200px' : 'auto' }}>
                                {/* Basic Info Grid */}
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '16px' }}>
                                    {[
                                        ['Entry Date', new Date(detailEntry.entryDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })],
                                        ['Total Bags', detailEntry.bags?.toLocaleString('en-IN')],
                                        ['Packaging', `${detailEntry.packaging || '75'} Kg`],
                                        ['Variety', toTitleCase(detailEntry.variety || '-')],
                                    ].map(([label, value], i) => (
                                        <div key={i} style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                            <div style={{ fontSize: '10px', color: '#64748b', marginBottom: '4px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
                                            <div style={{ fontSize: '14px', fontWeight: '700', color: '#1e293b' }}>{value || '-'}</div>
                                        </div>
                                    ))}
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr', gap: '12px', marginBottom: '24px' }}>
                                    <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                        <div style={{ fontSize: '10px', color: '#64748b', marginBottom: '4px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Party Name</div>
                                        <div style={{ fontSize: '15px', fontWeight: '700', color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{getPartyLabel(detailEntry)}</div>
                                    </div>
                                    <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                        <div style={{ fontSize: '10px', color: '#64748b', marginBottom: '4px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Location</div>
                                        <div style={{ fontSize: '14px', fontWeight: '700', color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{toTitleCase(detailEntry.location || '-')}</div>
                                    </div>
                                    <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                        <div style={{ fontSize: '10px', color: '#64748b', marginBottom: '4px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Collected By</div>
                                        <div style={{ fontSize: '14px', fontWeight: '700', color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{toTitleCase(detailEntry.sampleCollectedBy || '-')}</div>
                                    </div>
                                </div>

                                {/* Quality Parameters — hide 0 values */}
                                <h4 style={{ margin: '0 0 10px', fontSize: '13px', color: '#e67e22', borderBottom: '2px solid #e67e22', paddingBottom: '6px' }}>🔬 Quality Parameters</h4>
                                {(() => {
                                    const qpAll = (detailEntry as any).qualityAttemptDetails && (detailEntry as any).qualityAttemptDetails.length > 0
                                        ? [...(detailEntry as any).qualityAttemptDetails].sort((a,b) => (a.attemptNo || 0) - (b.attemptNo || 0))
                                        : (detailEntry as any).qualityParameters ? [(detailEntry as any).qualityParameters] : [];
                                    const qpList = detailMode === 'history'
                                        ? qpAll
                                        : (qpAll.length > 0 ? [qpAll[qpAll.length - 1]] : []);

                                    if (qpList.length === 0) return <div style={{ color: '#999', textAlign: 'center', padding: '12px', fontSize: '12px' }}>No quality data</div>;

                                    const trimZeros = (raw: string) => raw.replace(/(\.\d*?[1-9])0+$/, '$1').replace(/\.0+$/, '');
                                    const fmt = (v: any, forceDecimal = false, precision = 2) => {
                                        if (v == null || v === '') return null;
                                        // If value contains letters (e.g. 'x'), return as-is
                                        if (typeof v === 'string') {
                                            const raw = v.trim();
                                            if (!raw) return null;
                                            if (/[a-zA-Z]/.test(raw)) return raw;
                                            const num = Number(raw);
                                            if (!Number.isFinite(num) || num === 0) return null;
                                            return trimZeros(raw);
                                        }
                                        const n = Number(v);
                                        if (isNaN(n) || n === 0) return null;
                                        const fixed = n.toFixed(forceDecimal ? 1 : precision);
                                        return trimZeros(fixed);
                                    };
                                    const displayVal = (rawVal: any, numericVal: any) => {
                                        const raw = rawVal != null ? String(rawVal).trim() : '';
                                        if (raw) {
                                            const num = Number(raw);
                                            if (!Number.isFinite(num) || num !== 0) return raw;
                                        }
                                        return fmt(numericVal);
                                    };
                                    const fmtB = (v: any, useBrackets = false) => {
                                        const f = fmt(v);
                                        return f && useBrackets ? `(${f})` : f;
                                    };

                                    const QItem = ({ label, value }: { label: string; value: React.ReactNode }) => {
                                        const isBold = ['Grains Count', 'Paddy WB'].includes(label);
                                        return (
                                            <div style={{ background: '#f8f9fa', padding: '8px 10px', borderRadius: '6px', border: '1px solid #e0e0e0', textAlign: 'center' }}>
                                                <div style={{ fontSize: '10px', color: '#666', marginBottom: '2px', fontWeight: '600' }}>{label}</div>
                                                <div style={{ fontSize: '13px', fontWeight: isBold ? '800' : '700', color: isBold ? '#000' : '#2c3e50' }}>{value || '-'}</div>
                                            </div>
                                        );
                                    };
                                    const qualityPhotoUrl = qpList.find((qp: any) => qp?.uploadFileUrl)?.uploadFileUrl;
                                    const hasHistory = detailMode === 'history' && qpList.length > 1;
                                    const getAttemptLabel = (attemptNo: number, idx: number) => {
                                        const num = attemptNo || idx + 1;
                                        if (num === 1) return '1st Sample';
                                        if (num === 2) return '2nd Sample';
                                        if (num === 3) return '3rd Sample';
                                        return `${num}th Sample`;
                                    };

                                    if (hasHistory) {
                                        const columns = [
                                            { key: 'reportedBy', label: 'Sample Reported By' },
                                            { key: 'moisture', label: 'Moisture' },
                                            { key: 'cutting', label: 'Cutting' },
                                            { key: 'bend', label: 'Bend' },
                                            { key: 'grainsCount', label: 'Grains Count' },
                                            { key: 'mix', label: 'Mix' },
                                            { key: 'mixS', label: 'S Mix' },
                                            { key: 'mixL', label: 'L Mix' },
                                            { key: 'kandu', label: 'Kandu' },
                                            { key: 'oil', label: 'Oil' },
                                            { key: 'sk', label: 'SK' },
                                            { key: 'wbR', label: 'WB-R' },
                                            { key: 'wbBk', label: 'WB-BK' },
                                            { key: 'wbT', label: 'WB-T' },
                                            { key: 'paddyWb', label: 'Paddy WB' }
                                        ];

                                        const getCellValue = (qp: any, key: string) => {
                                            if (key === 'reportedBy') return toTitleCase(qp.reportedBy || '-');
                                            if (key === 'moisture') {
                                                const val = displayVal(qp.moistureRaw, qp.moisture);
                                                return val ? `${val}%` : '-';
                                            }
                                            if (key === 'cutting') {
                                                const cut1 = displayVal(qp.cutting1Raw, qp.cutting1);
                                                const cut2 = displayVal(qp.cutting2Raw, qp.cutting2);
                                                return cut1 && cut2 ? `${cut1}x${cut2}` : '-';
                                            }
                                            if (key === 'bend') {
                                                const bend1 = displayVal(qp.bend1Raw, qp.bend1);
                                                const bend2 = displayVal(qp.bend2Raw, qp.bend2);
                                                return bend1 && bend2 ? `${bend1}x${bend2}` : '-';
                                            }
                                            if (key === 'grainsCount') {
                                                const val = displayVal(qp.grainsCountRaw, qp.grainsCount);
                                                return val ? `(${val})` : '-';
                                            }
                                            if (key === 'mix') return displayVal(qp.mixRaw, qp.mix) || '-';
                                            if (key === 'mixS') return displayVal(qp.mixSRaw, qp.mixS) || '-';
                                            if (key === 'mixL') return displayVal(qp.mixLRaw, qp.mixL) || '-';
                                            if (key === 'kandu') return displayVal(qp.kanduRaw, qp.kandu) || '-';
                                            if (key === 'oil') return displayVal(qp.oilRaw, qp.oil) || '-';
                                            if (key === 'sk') return displayVal(qp.skRaw, qp.sk) || '-';
                                            if (key === 'wbR') return displayVal(qp.wbRRaw, qp.wbR) || '-';
                                            if (key === 'wbBk') return displayVal(qp.wbBkRaw, qp.wbBk) || '-';
                                            if (key === 'wbT') return displayVal(qp.wbTRaw, qp.wbT) || '-';
                                            if (key === 'paddyWb') return displayVal(qp.paddyWbRaw, qp.paddyWb) || '-';
                                            return '-';
                                        };

                                        return (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                                {qualityPhotoUrl && (
                                                    <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: '8px', padding: '10px' }}>
                                                        <div style={{ fontSize: '11px', fontWeight: '800', color: '#1d4ed8', marginBottom: '8px', textTransform: 'uppercase' }}>Quality Photo</div>
                                                        <img
                                                            src={`${API_URL.replace('/api', '')}${qualityPhotoUrl}`}
                                                            alt="Quality"
                                                            style={{ width: '100%', height: '200px', objectFit: 'cover', borderRadius: '6px', border: '1px solid #e0e0e0' }}
                                                        />
                                                    </div>
                                                )}
                                                <div style={{ overflowX: 'auto' }}>
                                                    <table style={{ width: '100%', minWidth: '1600px', borderCollapse: 'collapse', fontSize: '12px' }}>
                                                        <thead>
                                                            <tr>
                                                                <th style={{ border: '1px solid #e0e0e0', padding: '6px', background: '#f7f7f7', textAlign: 'left', whiteSpace: 'nowrap' }}>Sample</th>
                                                                {columns.map(col => (
                                                                    <th key={col.key} style={{ border: '1px solid #e0e0e0', padding: '6px', background: '#f7f7f7', textAlign: 'center', whiteSpace: 'nowrap' }}>{col.label}</th>
                                                                ))}
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {qpList.map((qp: any, idx: number) => (
                                                                <tr key={`${qp.attemptNo || idx}-row`}>
                                                                    <td style={{ border: '1px solid #e0e0e0', padding: '6px', fontWeight: 700, whiteSpace: 'nowrap' }}>
                                                                        {getAttemptLabel(qp.attemptNo, idx)}
                                                                    </td>
                                                                    {columns.map(col => (
                                                                        <td key={`${qp.attemptNo || idx}-${col.key}`} style={{ border: '1px solid #e0e0e0', padding: '6px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                                                                            {getCellValue(qp, col.key)}
                                                                        </td>
                                                                    ))}
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </div>
                                        );
                                    }

                                    return (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                            {qualityPhotoUrl && (
                                                <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: '8px', padding: '10px' }}>
                                                    <div style={{ fontSize: '11px', fontWeight: '800', color: '#1d4ed8', marginBottom: '8px', textTransform: 'uppercase' }}>Quality Photo</div>
                                                    <img
                                                        src={`${API_URL.replace('/api', '')}${qualityPhotoUrl}`}
                                                        alt="Quality"
                                                        style={{ width: '100%', height: '200px', objectFit: 'cover', borderRadius: '6px', border: '1px solid #e0e0e0' }}
                                                    />
                                                </div>
                                            )}
                                            {qpList.map((qp: any, idx: number) => {
                                                const row1: { label: string; value: React.ReactNode }[] = [];
                                                const moistureVal = displayVal((qp as any).moistureRaw, qp.moisture);
                                                if (moistureVal) {
                                                    const dryVal = displayVal((qp as any).dryMoistureRaw, (qp as any).dryMoisture);
                                                    row1.push({
                                                        label: 'Moisture',
                                                        value: dryVal ? (
                                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1px' }}>
                                                                <span style={{ color: '#e67e22', fontWeight: '800', fontSize: '11px' }}>{dryVal}%</span>
                                                                <span>{moistureVal}%</span>
                                                            </div>
                                                        ) : `${moistureVal}%`
                                                    });
                                                }
                                                const cut1 = displayVal((qp as any).cutting1Raw, qp.cutting1);
                                                const cut2 = displayVal((qp as any).cutting2Raw, qp.cutting2);
                                                if (cut1 && cut2) row1.push({ label: 'Cutting', value: `${cut1}x${cut2}` });
                                                const bend1 = displayVal((qp as any).bend1Raw, qp.bend1);
                                                const bend2 = displayVal((qp as any).bend2Raw, qp.bend2);
                                                if (bend1 && bend2) row1.push({ label: 'Bend', value: `${bend1}x${bend2}` });
                                                const grainsVal = displayVal((qp as any).grainsCountRaw, qp.grainsCount);
                                                if (grainsVal) row1.push({ label: 'Grains Count', value: `(${grainsVal})` });
                                                
                                                const row2: { label: string; value: React.ReactNode }[] = [];
                                                const mixVal = displayVal((qp as any).mixRaw, qp.mix);
                                                const mixSVal = displayVal((qp as any).mixSRaw, qp.mixS);
                                                const mixLVal = displayVal((qp as any).mixLRaw, qp.mixL);
                                                if (mixVal) row2.push({ label: 'Mix', value: mixVal });
                                                if (mixSVal) row2.push({ label: 'S Mix', value: mixSVal });
                                                if (mixLVal) row2.push({ label: 'L Mix', value: mixLVal });
                                                
                                                const hasKandu = displayVal((qp as any).kanduRaw, qp.kandu);
                                                const hasOil = displayVal((qp as any).oilRaw, qp.oil);
                                                const hasSK = displayVal((qp as any).skRaw, qp.sk);
                                                const row3: { label: string; value: React.ReactNode }[] = [];
                                                if (hasKandu) row3.push({ label: 'Kandu', value: hasKandu });
                                                if (hasOil) row3.push({ label: 'Oil', value: hasOil });
                                                if (hasSK) row3.push({ label: 'SK', value: hasSK });
                                                
                                                const row4: { label: string; value: React.ReactNode }[] = [];
                                                const wbRVal = displayVal((qp as any).wbRRaw, qp.wbR);
                                                const wbBkVal = displayVal((qp as any).wbBkRaw, qp.wbBk);
                                                const wbTVal = displayVal((qp as any).wbTRaw, qp.wbT);
                                                if (wbRVal) row4.push({ label: 'WB-R', value: wbRVal });
                                                if (wbBkVal) row4.push({ label: 'WB-BK', value: wbBkVal });
                                                if (wbTVal) row4.push({ label: 'WB-T', value: wbTVal });
                                                
                                                const hasPaddyWb = displayVal((qp as any).paddyWbRaw, qp.paddyWb);
                                                
                                                const wrapperStyle = qpList.length > 1 ? { background: '#fcfcfc', border: '1px solid #eee', borderRadius: '6px', padding: '12px' } : {};

                                                return (
                                                    <div key={idx} style={wrapperStyle}>
                                                        {qpList.length > 1 && (
                                                            <div style={{ fontSize: '11px', fontWeight: '800', color: '#e67e22', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                                                {qp.attemptNo ? `${qp.attemptNo}${qp.attemptNo === 1 ? 'st' : qp.attemptNo === 2 ? 'nd' : 'th'} Quality` : `${idx + 1}${idx === 0 ? 'st' : idx === 1 ? 'nd' : 'th'} Quality`}
                                                            </div>
                                                        )}
                                                        {row1.length > 0 && <div style={{ display: 'grid', gridTemplateColumns: `repeat(${row1.length}, 1fr)`, gap: '8px', marginBottom: '8px' }}>{row1.map(item => <QItem key={item.label} label={item.label} value={item.value} />)}</div>}
                                                        {row2.length > 0 && <div style={{ display: 'grid', gridTemplateColumns: `repeat(${row2.length}, 1fr)`, gap: '8px', marginBottom: '8px' }}>{row2.map(item => <QItem key={item.label} label={item.label} value={item.value} />)}</div>}
                                                        {row3.length > 0 && (
                                                            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${row3.length}, 1fr)`, gap: '8px', marginBottom: '8px' }}>
                                                                {row3.map(item => <QItem key={item.label} label={item.label} value={item.value} />)}
                                                            </div>
                                                        )}
                                                        {row4.length > 0 && <div style={{ display: 'grid', gridTemplateColumns: `repeat(${row4.length}, 1fr)`, gap: '8px', marginBottom: '8px' }}>{row4.map(item => <QItem key={item.label} label={item.label} value={item.value} />)}</div>}
                                                        {hasPaddyWb && (
                                                            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '8px', marginTop: '10px' }}>
                                                                <div style={{
                                                                    background: Number(qp.paddyWb) < 50 ? '#fff5f5' : (Number(qp.paddyWb) <= 50.5 ? '#fff9f0' : '#e8f5e9'),
                                                                    padding: '8px 10px',
                                                                    borderRadius: '6px',
                                                                    border: `1px solid ${Number(qp.paddyWb) < 50 ? '#feb2b2' : (Number(qp.paddyWb) <= 50.5 ? '#fbd38d' : '#c8e6c9')}`,
                                                                    textAlign: 'center',
                                                                    width: '32%'
                                                                }}>
                                                                    <div style={{ fontSize: '10px', color: Number(qp.paddyWb) < 50 ? '#c53030' : (Number(qp.paddyWb) <= 50.5 ? '#9c4221' : '#2e7d32'), marginBottom: '2px', fontWeight: '600' }}>Paddy WB</div>
                                                                    <div style={{ fontSize: '13px', fontWeight: '800', color: Number(qp.paddyWb) < 50 ? '#d32f2f' : (Number(qp.paddyWb) <= 50.5 ? '#f39c12' : '#1b5e20') }}>{hasPaddyWb}</div>
                                                                </div>
                                                            </div>
                                                        )}
                                                        {qp.reportedBy && (
                                                            <div style={{ marginTop: '8px' }}>
                                                                <div style={{ background: '#f8f9fa', padding: '8px 10px', borderRadius: '6px', border: '1px solid #e0e0e0', textAlign: 'center' }}>
                                                                    <div style={{ fontSize: '10px', color: '#666', marginBottom: '2px', fontWeight: '600' }}>Sample Reported By</div>
                                                                    <div style={{ fontSize: '13px', fontWeight: '700', color: '#2c3e50' }}>{toSentenceCase(qp.reportedBy)}</div>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    );
                                })()}

                                {/* Pricing & Offers History */}
                                <h4 style={{ margin: '24px 0 12px', fontSize: '14px', color: '#1e293b', borderBottom: '2px solid #e2e8f0', paddingBottom: '8px', fontWeight: '900', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    💰 Pricing & Offers
                                </h4>
                                {(() => {
                                    const off = detailEntry.offering;
                                    const versions = off?.offerVersions || [];
                                    if (!off && versions.length === 0) return <div style={{ color: '#94a3b8', fontSize: '13px', fontStyle: 'italic' }}>No pricing details available.</div>;

                                    return (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                            {/* Final Rate Highlight */}
                                            {(off?.finalPrice || off?.finalBaseRate) && (
                                                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                    <div>
                                                        <div style={{ fontSize: '10px', color: '#166534', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Confirmed Final Price</div>
                                                        <div style={{ fontSize: '24px', fontWeight: '900', color: '#14532d' }}>Rs {toNumberText(off.finalPrice || off.finalBaseRate || 0)}</div>
                                                    </div>
                                                    <div style={{ textAlign: 'right' }}>
                                                        <div style={{ fontSize: '10px', color: '#166534', fontWeight: '700', marginBottom: '2px' }}>Base Rate Type</div>
                                                        <div style={{ fontSize: '13px', fontWeight: '700', color: '#15803d' }}>{(off.finalBaseRateType || off.baseRateType || '').replace(/_/g, '/')} / {formatRateUnitLabel(off.finalBaseRateUnit || off.baseRateUnit)}</div>
                                                    </div>
                                                </div>
                                            )}

                                            {/* Offer History */}
                                            {versions.length > 0 && (
                                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '8px' }}>
                                                    {versions.map((ov, i) => (
                                                        <div key={i} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px' }}>
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                                                <span style={{ fontSize: '10px', fontWeight: '900', background: '#e0f2fe', color: '#0369a1', padding: '2px 6px', borderRadius: '4px' }}>{ov.key}</span>
                                                                {(ov.finalPrice || ov.finalBaseRate) && <span style={{ fontSize: '10px', fontWeight: '900', background: '#dcfce7', color: '#15803d', padding: '2px 6px', borderRadius: '4px' }}>PASSED</span>}
                                                            </div>
                                                            <div style={{ fontSize: '16px', fontWeight: '900', color: '#1e293b' }}>Rs {toNumberText(ov.offerBaseRateValue || ov.offeringPrice || 0)}</div>
                                                            <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>{(ov.baseRateType || '').replace(/_/g, '/')}</div>
                                                            {(ov.finalPrice || ov.finalBaseRate) && (
                                                                <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px dashed #cbd5e1' }}>
                                                                    <div style={{ fontSize: '9px', color: '#166534', fontWeight: '700' }}>Final: <span style={{ fontSize: '12px', fontWeight: '900' }}>Rs {toNumberText(ov.finalPrice || ov.finalBaseRate || 0)}</span></div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            )}

                                            {/* Single Offer Fallback */}
                                            {versions.length === 0 && (off?.offerBaseRateValue || off?.offeringPrice) && (
                                                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px' }}>
                                                    <div style={{ fontSize: '10px', color: '#64748b', fontWeight: '700', textTransform: 'uppercase', marginBottom: '4px' }}>Active Offer</div>
                                                    <div style={{ fontSize: '18px', fontWeight: '900', color: '#1e293b' }}>Rs {toNumberText(off.offerBaseRateValue || off.offeringPrice || 0)}</div>
                                                    <div style={{ fontSize: '11px', color: '#64748b' }}>{(off.baseRateType || '').replace(/_/g, '/')} / {formatRateUnitLabel(off.baseRateUnit)}</div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })()}

                                {/* Cooking History & Remarks */}
                                <h4 style={{ margin: '16px 0 10px', fontSize: '13px', color: '#1565c0', borderBottom: '2px solid #1565c0', paddingBottom: '6px' }}>🍳 Cooking History & Remarks</h4>
                                {(() => {
                                    const cr = detailEntry.cookingReport;
                                    const history = Array.isArray(cr?.history) ? cr!.history : [];
                                    const allRemarks: string[] = [];
                                    if (cr?.remarks) allRemarks.push(cr.remarks);
                                    history.forEach(h => { if (h?.remarks) allRemarks.push(h.remarks); });

                                    return (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                            {history.length > 0 ? (
                                                <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '10px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                                                    <div style={{ fontSize: '11px', color: '#64748b', fontWeight: '800', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #e2e8f0', paddingBottom: '6px' }}>Cooking Activity Log</div>
                                                    <div style={{ overflowX: 'auto' }}>
                                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                                                            <thead>
                                                                <tr style={{ color: '#475569', borderBottom: '2px solid #f1f5f9' }}>
                                                                    <th style={{ textAlign: 'center', padding: '8px 4px', fontWeight: '800', width: '40px', border: '1px solid #e2e8f0' }}>No</th>
                                                                    <th style={{ textAlign: 'left', padding: '8px 4px', fontWeight: '800', border: '1px solid #e2e8f0' }}>Status</th>
                                                                    <th style={{ textAlign: 'left', padding: '8px 4px', fontWeight: '800', border: '1px solid #e2e8f0' }}>Done By</th>
                                                                    <th style={{ textAlign: 'left', padding: '8px 4px', fontWeight: '800', border: '1px solid #e2e8f0' }}>Approved By</th>
                                                                    <th style={{ textAlign: 'center', padding: '8px 4px', fontWeight: '800', width: '40px', border: '1px solid #e2e8f0' }}>Rem</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {(() => {
                                                                    const processedHistory = (() => {
                                                                        const result: typeof history = [];
                                                                        for (let i = 0; i < history.length; i++) {
                                                                            const current = history[i];
                                                                            const next = history[i + 1];
                                                                            
                                                                            // If current is "Submitted" (no status) and next is a "Decision" (has status),
                                                                            // we merge them: take the original submission time from 'current' 
                                                                            // but everything else (status, decision makers) from 'next'.
                                                                            if (!current.status && next && next.status) {
                                                                                result.push({
                                                                                    ...next,
                                                                                    date: current.date || next.date
                                                                                });
                                                                                i++; // skip next since merged
                                                                                continue;
                                                                            }
                                                                            result.push(current);
                                                                        }
                                                                        return result;
                                                                    })();

                                                                    return processedHistory.map((h: any, idx) => {
                                                                        const statusString = (h.status || 'Submitted').toLowerCase();
                                                                        const statusColor = statusString === 'pass' ? '#166534' : statusString === 'fail' ? '#991b1b' : statusString === 'recheck' ? '#1565c0' : '#475569';
                                                                        const statusBg = statusString === 'pass' ? '#dcfce7' : statusString === 'fail' ? '#fee2e2' : statusString === 'recheck' ? '#e0f2fe' : '#f1f5f9';
                                                                        
                                                                        return (
                                                                            <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9', transition: 'background-color 0.2s' }}>
                                                                                <td style={{ textAlign: 'center', padding: '8px 4px', fontWeight: '700', color: '#64748b', border: '1px solid #e2e8f0' }}>{idx + 1}.</td>
                                                                                <td style={{ padding: '8px 4px', border: '1px solid #e2e8f0' }}>
                                                                                    <span style={{ 
                                                                                        background: statusBg, 
                                                                                        color: statusColor, 
                                                                                        padding: '2px 8px', 
                                                                                        borderRadius: '12px', 
                                                                                        fontSize: '10px', 
                                                                                        fontWeight: '800', 
                                                                                        textTransform: 'uppercase' 
                                                                                    }}>
                                                                                        {h.status ? toTitleCase(h.status) : 'Submitted'}
                                                                                    </span>
                                                                                </td>
                                                                                <td style={{ padding: '8px 4px', color: '#334155', border: '1px solid #e2e8f0' }}>
                                                                                    <div style={{ fontWeight: '700', fontSize: '13px' }}>{toTitleCase(h.cookingDoneBy || '-')}</div>
                                                                                    <div style={{ fontSize: '10px', color: '#64748b', fontWeight: '500', marginTop: '2px' }}>{formatShortDateTime(h.date)}</div>
                                                                                </td>
                                                                                <td style={{ padding: '8px 4px', color: '#334155', border: '1px solid #e2e8f0' }}>
                                                                                    <div style={{ fontWeight: '700', fontSize: '13px' }}>{toTitleCase(h.approvedBy || '-')}</div>
                                                                                    <div style={{ fontSize: '10px', color: '#64748b', fontWeight: '500', marginTop: '2px' }}>{formatShortDateTime(h.date)}</div>
                                                                                </td>
                                                                                <td style={{ textAlign: 'center', padding: '8px 4px', border: '1px solid #e2e8f0' }}>
                                                                                    {h.remarks ? (
                                                                                        <button 
                                                                                            onClick={() => setRemarksPopup({ isOpen: true, text: h.remarks || '' })}
                                                                                            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', padding: 0 }}
                                                                                            title="View Remarks"
                                                                                        >
                                                                                            🔍
                                                                                        </button>
                                                                                    ) : '-'}
                                                                                </td>
                                                                            </tr>
                                                                        );
                                                                    });
                                                                })()}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div style={{ background: '#fff9f0', padding: '10px', borderRadius: '8px', border: '1px solid #ffe0b2', textAlign: 'center', fontSize: '12px', color: '#e65100' }}>
                                                    No cooking history recorded yet.
                                                </div>
                                            )}

                                            {allRemarks.length > 0 && (
                                                <div style={{ background: '#f3e5f5', padding: '10px', borderRadius: '8px', border: '1px solid #e1bee7' }}>
                                                    <div style={{ fontSize: '10px', color: '#7b1fa2', fontWeight: '700', marginBottom: '4px', textTransform: 'uppercase' }}>All Remarks Summary</div>
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                        {Array.from(new Set(allRemarks)).map((rem, i) => (
                                                            <div key={i} style={{ fontSize: '12px', color: '#4a148c', paddingBottom: '3px', borderBottom: i === allRemarks.length - 1 ? 'none' : '1px dashed #d1c4e9' }}>
                                                                {rem}
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })()}


                                {/* GPS & Photos for Location Sample */}
                                {detailEntry.entryType === 'LOCATION_SAMPLE' && (
                                    <>
                                        <h4 style={{ margin: '12px 0 10px', fontSize: '13px', color: '#e67e22', borderBottom: '2px solid #e67e22', paddingBottom: '6px' }}>📍 Location Details</h4>
                                        {(detailEntry as any).gpsCoordinates && (
                                            <div style={{ marginBottom: '10px' }}>
                                                <div style={{ background: '#f8f9fa', padding: '12px', borderRadius: '6px', border: '1px solid #e0e0e0', marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                    <div style={{ fontSize: '11px', color: '#666', fontWeight: '800', textTransform: 'uppercase' }}>GPS Coordinates Captured</div>
                                                    <a
                                                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent((detailEntry as any).gpsCoordinates)}`}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        style={{ display: 'inline-block', padding: '6px 16px', background: '#e67e22', color: 'white', borderRadius: '4px', textDecoration: 'none', fontSize: '11px', fontWeight: '800', letterSpacing: '0.5px' }}
                                                    >
                                                        MAP LINK
                                                    </a>
                                                </div>
                                            </div>
                                        )}
                                        {(detailEntry as any).godownImageUrl && (
                                            <div style={{ marginBottom: '10px' }}>
                                                <div style={{ fontSize: '10px', color: '#666', marginBottom: '4px', fontWeight: '600' }}>Godown Image</div>
                                                <a href={(detailEntry as any).godownImageUrl} target="_blank" rel="noopener noreferrer">
                                                    <img src={(detailEntry as any).godownImageUrl} alt="Godown" style={{ maxWidth: '100%', maxHeight: '150px', borderRadius: '6px', border: '1px solid #e0e0e0' }} />
                                                </a>
                                            </div>
                                        )}
                                        {(detailEntry as any).paddyLotImageUrl && (
                                            <div style={{ marginBottom: '10px' }}>
                                                <div style={{ fontSize: '10px', color: '#666', marginBottom: '4px', fontWeight: '600' }}>Paddy Lot Image</div>
                                                <a href={(detailEntry as any).paddyLotImageUrl} target="_blank" rel="noopener noreferrer">
                                                    <img src={(detailEntry as any).paddyLotImageUrl} alt="Paddy Lot" style={{ maxWidth: '100%', maxHeight: '150px', borderRadius: '6px', border: '1px solid #e0e0e0' }} />
                                                </a>
                                            </div>
                                        )}
                                    </>
                                )}

                                <button onClick={() => setDetailEntry(null)}
                                    style={{ marginTop: '16px', width: '100%', padding: '8px', backgroundColor: '#e74c3c', color: 'white', border: 'none', borderRadius: '4px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>
                                    Close
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {pricingDetail && (
                <div
                    style={{
                        position: 'fixed',
                        inset: 0,
                        backgroundColor: 'rgba(0,0,0,0.55)',
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        zIndex: 1000,
                        padding: '16px'
                    }}
                    onClick={() => setPricingDetail(null)}
                >
                    <div
                        style={{
                            background: '#ffffff',
                            width: '100%',
                            maxWidth: '720px',
                            borderRadius: '10px',
                            boxShadow: '0 16px 50px rgba(0,0,0,0.25)',
                            overflow: 'hidden'
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div style={{ background: pricingDetail.mode === 'offer' ? '#1565c0' : '#2e7d32', color: '#fff', padding: '14px 18px' }}>
                            <div style={{ fontSize: '18px', fontWeight: '800' }}>
                                {pricingDetail.mode === 'offer' ? 'Offer Details' : 'Final Details'}
                            </div>
                            <div style={{ fontSize: '12px', opacity: 0.95, marginTop: '4px' }}>
                                {getPartyLabel(pricingDetail.entry)} | {toTitleCase(pricingDetail.entry.variety)} | {toTitleCase(pricingDetail.entry.location)}
                            </div>
                        </div>
                        <div style={{ padding: '16px 18px 18px' }}>
                            {pricingDetail.entry.offering ? (
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
                                    {getPricingRows(pricingDetail.entry.offering, pricingDetail.mode).map(([label, value]) => (
                                        <div key={String(label)} style={{ background: '#f8f9fa', border: '1px solid #dfe3e8', borderRadius: '8px', padding: '10px 12px' }}>
                                            <div style={{ fontSize: '11px', fontWeight: '700', color: '#5f6368', marginBottom: '4px' }}>{label}</div>
                                            <div style={{ fontSize: '14px', fontWeight: '700', color: '#1f2937' }}>{value as string}</div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div style={{ color: '#999', textAlign: 'center', padding: '12px' }}>No pricing data</div>
                            )}
                            <button
                                onClick={() => setPricingDetail(null)}
                                style={{
                                    marginTop: '16px',
                                    width: '100%',
                                    padding: '9px',
                                    backgroundColor: pricingDetail.mode === 'offer' ? '#1565c0' : '#2e7d32',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '6px',
                                    fontSize: '13px',
                                    fontWeight: '700',
                                    cursor: 'pointer'
                                }}
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {remarksPopup.isOpen && (
                <div
                    style={{
                        position: 'fixed',
                        inset: 0,
                        backgroundColor: 'rgba(0,0,0,0.55)',
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        zIndex: 1000,
                        padding: '16px'
                    }}
                    onClick={() => setRemarksPopup({ isOpen: false, text: '' })}
                >
                    <div
                        style={{ background: '#fff', width: '100%', maxWidth: '420px', borderRadius: '10px', boxShadow: '0 16px 50px rgba(0,0,0,0.25)', padding: '16px' }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div style={{ fontSize: '16px', fontWeight: '800', color: '#1f2937', marginBottom: '10px' }}>Remarks</div>
                        <div style={{ fontSize: '13px', color: '#475569', background: '#f8fafc', padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0', minHeight: '60px' }}>
                            {remarksPopup.text || '-'}
                        </div>
                        <button
                            onClick={() => setRemarksPopup({ isOpen: false, text: '' })}
                            style={{ marginTop: '12px', width: '100%', padding: '9px', background: '#1565c0', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: '700', cursor: 'pointer' }}
                        >
                            Close
                        </button>
                    </div>
                </div>
            )}
            {/* Pagination */}
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '12px', padding: '16px 0', marginTop: '12px' }}>
                <button disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}
                    style={{ padding: '6px 16px', borderRadius: '4px', border: '1px solid #ccc', background: page <= 1 ? '#eee' : '#fff', cursor: page <= 1 ? 'not-allowed' : 'pointer', fontWeight: '600' }}>
                    ← Prev
                </button>
                <span style={{ fontSize: '13px', color: '#666' }}>Page {page} of {totalPages} &nbsp;({total} total)</span>
                <button disabled={page >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    style={{ padding: '6px 16px', borderRadius: '4px', border: '1px solid #ccc', background: page >= totalPages ? '#eee' : '#fff', cursor: page >= totalPages ? 'not-allowed' : 'pointer', fontWeight: '600' }}>
                    Next →
                </button>
            </div>
        </div >
    );
};

export default AdminSampleBook2;

