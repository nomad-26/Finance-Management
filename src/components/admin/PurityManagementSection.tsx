import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { PurityConfig, PurityCategory } from '../../types';
import {
  Plus,
  Edit2,
  Trash2,
  CheckCircle2,
  Ban,
  Search,
  Sparkles,
  X,
  AlertCircle,
  HelpCircle
} from 'lucide-react';

export const PurityManagementSection: React.FC = () => {
  const {
    masterControlSettings,
    addPurityOption,
    updatePurityOption,
    togglePurityStatus,
    deletePurityOption,
    getPurityRate,
    loans,
    userRole
  } = useApp();

  const isAuthorized = userRole === 'ADMIN';

  const purityOptions = masterControlSettings?.purityOptions || [];
  const baseGoldRate = masterControlSettings?.goldRate22ct || 6400;

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState<'ALL' | 'ACTIVE' | 'DISABLED' | 'GOLD' | 'SILVER' | 'OTHER'>('ALL');

  // Modal States
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingPurity, setEditingPurity] = useState<PurityConfig | null>(null);
  const [togglingPurity, setTogglingPurity] = useState<PurityConfig | null>(null);
  const [deletingPurity, setDeletingPurity] = useState<PurityConfig | null>(null);

  // Form Field States
  const [formName, setFormName] = useState('');
  const [formCategory, setFormCategory] = useState<PurityCategory>('GOLD');
  const [formPurityValue, setFormPurityValue] = useState<string>('');
  const [formRatePerGram, setFormRatePerGram] = useState<string>('');
  const [formDescription, setFormDescription] = useState('');
  const [formActive, setFormActive] = useState(true);
  const [formError, setFormError] = useState('');

  // Sorted list: GOLD -> SILVER -> OTHER, then by sortOrder
  const sortedPurities = useMemo(() => {
    const catOrder: Record<PurityCategory, number> = { GOLD: 1, SILVER: 2, OTHER: 3 };
    return [...purityOptions].sort((a, b) => {
      const catDiff = (catOrder[a.category] || 99) - (catOrder[b.category] || 99);
      if (catDiff !== 0) return catDiff;
      return (a.sortOrder || 0) - (b.sortOrder || 0);
    });
  }, [purityOptions]);

  // Filtered List
  const filteredList = useMemo(() => {
    return sortedPurities.filter(item => {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        item.name.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q) ||
        (item.description && item.description.toLowerCase().includes(q)) ||
        (item.purityValue && String(item.purityValue).includes(q));

      if (!matchesSearch) return false;

      if (filterCategory === 'ACTIVE') return item.active;
      if (filterCategory === 'DISABLED') return !item.active;
      if (filterCategory === 'GOLD') return item.category === 'GOLD';
      if (filterCategory === 'SILVER') return item.category === 'SILVER';
      if (filterCategory === 'OTHER') return item.category === 'OTHER';
      return true;
    });
  }, [sortedPurities, searchQuery, filterCategory]);

  // Dynamic counts for summary cards
  const totalCount = purityOptions.length;
  const activeGoldCount = purityOptions.filter(p => p.active && p.category === 'GOLD').length;
  const activeSilverCount = purityOptions.filter(p => p.active && p.category === 'SILVER').length;
  const otherCount = purityOptions.filter(p => p.category === 'OTHER').length;

  // Handlers
  const handleOpenAdd = (defaultCat?: PurityCategory) => {
    setFormName('');
    setFormCategory(defaultCat || (filterCategory === 'OTHER' ? 'OTHER' : filterCategory === 'SILVER' ? 'SILVER' : 'GOLD'));
    setFormPurityValue('');
    setFormRatePerGram('');
    setFormDescription('');
    setFormActive(true);
    setFormError('');
    setIsAddModalOpen(true);
  };

  const handleOpenEdit = (item: PurityConfig) => {
    setEditingPurity(item);
    setFormName(item.name);
    setFormCategory(item.category);
    setFormPurityValue(item.purityValue !== undefined ? String(item.purityValue) : '');
    setFormRatePerGram(item.ratePerGram !== undefined ? String(item.ratePerGram) : '');
    setFormDescription(item.description || '');
    setFormActive(item.active);
    setFormError('');
  };

  const handleSavePurity = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    const trimmed = formName.trim();
    if (!trimmed) {
      setFormError('Name is required.');
      return;
    }

    const numPurityValue = formPurityValue.trim() !== '' ? Number(formPurityValue) : undefined;
    const numRatePerGram = formRatePerGram.trim() !== '' ? Number(formRatePerGram) : undefined;

    if (numPurityValue !== undefined && (isNaN(numPurityValue) || !isFinite(numPurityValue) || numPurityValue <= 0)) {
      setFormError('Enter a valid purity value.');
      return;
    }

    if (numRatePerGram !== undefined && (isNaN(numRatePerGram) || !isFinite(numRatePerGram) || numRatePerGram <= 0)) {
      setFormError('Enter a valid non-negative rate.');
      return;
    }

    if (editingPurity) {
      const res = updatePurityOption(editingPurity.id, {
        name: trimmed,
        category: formCategory,
        purityValue: numPurityValue,
        ratePerGram: numRatePerGram,
        description: formDescription,
        active: formActive
      });
      if (res.success) {
        setEditingPurity(null);
      } else {
        setFormError(res.message || 'Failed to update purity option.');
      }
    } else {
      const res = addPurityOption({
        name: trimmed,
        category: formCategory,
        purityValue: numPurityValue,
        ratePerGram: numRatePerGram,
        description: formDescription,
        active: formActive
      });
      if (res.success) {
        setIsAddModalOpen(false);
      } else {
        setFormError(res.message || 'Failed to add purity option.');
      }
    }
  };

  const handleConfirmToggle = () => {
    if (!togglingPurity) return;
    togglePurityStatus(togglingPurity.id);
    setTogglingPurity(null);
  };

  const handleConfirmDelete = () => {
    if (!deletingPurity) return;
    deletePurityOption(deletingPurity.id);
    setDeletingPurity(null);
  };

  // Check if a purity is referenced in historical loans
  const isPurityUsedInLoans = (p: PurityConfig) => {
    return loans.some(l =>
      (l.items || (l as any).ornamentItems || []).some((item: any) =>
        item.purity === p.name || item.purityId === p.id || item.purityName === p.name
      )
    );
  };

  // Dynamic label for name field
  const getNameLabel = (category: PurityCategory) => {
    if (category === 'GOLD') return 'PURITY NAME *';
    if (category === 'SILVER') return 'PURITY / STANDARD NAME *';
    return 'MATERIAL / PURITY NAME *';
  };

  const getNamePlaceholder = (category: PurityCategory) => {
    if (category === 'GOLD') return 'e.g. 22ct, 24ct, 18ct, 21ct';
    if (category === 'SILVER') return 'e.g. Silver 925, Silver 999, Silver 800';
    return 'e.g. Platinum 950, Mixed Metal, Custom Alloy, White Gold';
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* ════════════════════════════════════════════════════════════════════════
          CARD: PURITY MANAGEMENT
          ════════════════════════════════════════════════════════════════════════ */}
      <div className="card" style={{ padding: '24px', backgroundColor: 'var(--bg-card)', borderRadius: '12px', border: '1px solid var(--border-light)' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px', flexWrap: 'wrap', gap: '14px' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: 'var(--text-dark)', letterSpacing: '0.01em' }}>
              PURITY MANAGEMENT
            </h2>
            <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: 'var(--text-muted)' }}>
              Manage gold, silver and custom ornament purity options.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {isAuthorized && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => handleOpenAdd()}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, padding: '8px 18px', fontSize: '13px' }}
              >
                <Plus size={15} />
                <span>+ Add Purity</span>
              </button>
            )}
          </div>
        </div>

        {/* ════════════════════════════════════════════════════════════════════════
            SUMMARY CARDS (4 Pillars)
            ════════════════════════════════════════════════════════════════════════ */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: '12px',
            marginBottom: '22px'
          }}
        >
          <div style={{ padding: '14px 16px', borderRadius: '10px', backgroundColor: 'var(--bg-surface-secondary)', border: '1px solid var(--border-subtle)' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>TOTAL PURITIES</span>
            <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-dark)', marginTop: '4px' }}>{totalCount}</div>
          </div>

          <div style={{ padding: '14px 16px', borderRadius: '10px', backgroundColor: 'var(--bg-surface-secondary)', border: '1px solid var(--border-subtle)' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>ACTIVE GOLD</span>
            <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--color-gold-primary, #dfb83d)', marginTop: '4px' }}>
              {activeGoldCount}
            </div>
          </div>

          <div style={{ padding: '14px 16px', borderRadius: '10px', backgroundColor: 'var(--bg-surface-secondary)', border: '1px solid var(--border-subtle)' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>ACTIVE SILVER</span>
            <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--color-primary-accent, #10B981)', marginTop: '4px' }}>
              {activeSilverCount}
            </div>
          </div>

          <div style={{ padding: '14px 16px', borderRadius: '10px', backgroundColor: 'var(--bg-surface-secondary)', border: '1px solid var(--border-subtle)' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>OTHER</span>
            <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-dark)', marginTop: '4px' }}>
              {otherCount}
            </div>
          </div>
        </div>

        {/* ════════════════════════════════════════════════════════════════════════
            SEARCH & COMPACT FILTERS
            ════════════════════════════════════════════════════════════════════════ */}
        <div style={{ display: 'flex', gap: '12px', marginBottom: '18px', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ position: 'relative', width: '100%', maxWidth: '340px' }}>
            <Search
              size={15}
              style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}
            />
            <input
              type="text"
              placeholder="Search purity, category or description..."
              className="input-control"
              style={{ paddingLeft: '34px', height: '38px', fontSize: '13px' }}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '2px' }}
              >
                <X size={14} />
              </button>
            )}
          </div>

          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {(
              [
                { key: 'ALL', label: 'All' },
                { key: 'ACTIVE', label: 'Active' },
                { key: 'DISABLED', label: 'Disabled' },
                { key: 'GOLD', label: 'Gold' },
                { key: 'SILVER', label: 'Silver' },
                { key: 'OTHER', label: 'Other' }
              ] as const
            ).map((filter) => {
              const isSelected = filterCategory === filter.key;
              return (
                <button
                  key={filter.key}
                  type="button"
                  className={`btn btn-sm ${isSelected ? 'btn-primary' : 'btn-secondary'}`}
                  style={{
                    fontSize: '12px',
                    padding: '5px 14px',
                    borderRadius: '20px',
                    fontWeight: 700,
                    transition: 'all 0.15s ease'
                  }}
                  onClick={() => setFilterCategory(filter.key)}
                >
                  {filter.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* ════════════════════════════════════════════════════════════════════════
            CLEAN TABLE
            ════════════════════════════════════════════════════════════════════════ */}
        {filteredList.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              padding: '48px 20px',
              backgroundColor: 'var(--bg-surface-secondary)',
              borderRadius: '10px',
              border: '1px dashed var(--border-subtle)'
            }}
          >
            {filterCategory === 'OTHER' && otherCount === 0 ? (
              <>
                <p style={{ fontWeight: 800, fontSize: '15px', color: 'var(--text-dark)', margin: '0 0 6px 0' }}>
                  NO CUSTOM PURITIES YET
                </p>
                <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '0 0 16px 0' }}>
                  Create a custom material/purity option for special collateral items.
                </p>
                {isAuthorized && (
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => handleOpenAdd('OTHER')}
                    style={{ fontWeight: 700 }}
                  >
                    + Add Purity
                  </button>
                )}
              </>
            ) : (
              <>
                <p style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text-dark)', margin: '0 0 4px 0' }}>
                  No matching purity options found
                </p>
                <p style={{ fontSize: '12.5px', color: 'var(--text-muted)', margin: 0 }}>
                  Try changing your search keywords or filter criteria.
                </p>
              </>
            )}
          </div>
        ) : (
          <div className="table-container" style={{ overflowX: 'auto' }}>
            <table className="custom-table" style={{ fontSize: '13px', minWidth: '600px' }}>
              <thead>
                <tr>
                  <th style={{ width: '22%' }}>NAME</th>
                  <th style={{ width: '15%' }}>CATEGORY</th>
                  <th style={{ width: '15%' }}>PURITY</th>
                  <th style={{ width: '20%' }}>RATE / GRAM</th>
                  <th style={{ width: '13%' }}>STATUS</th>
                  <th style={{ width: '15%', textAlign: 'right' }}>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {filteredList.map((p) => {
                  const effectiveRate = getPurityRate(p.id);
                  const isUsed = isPurityUsedInLoans(p);
                  const isOther = p.category === 'OTHER';
                  const hasCustomRate = Boolean(p.ratePerGram && p.ratePerGram > 0);

                  return (
                    <tr key={p.id}>
                      {/* NAME */}
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontWeight: 800, color: 'var(--text-dark)', fontSize: '13.5px' }}>
                            {p.name}
                          </span>
                          {p.description && (
                            <span
                              title={p.description}
                              style={{ display: 'inline-flex', alignItems: 'center', color: 'var(--text-muted)', cursor: 'help' }}
                            >
                              <HelpCircle size={13} />
                            </span>
                          )}
                        </div>
                      </td>

                      {/* CATEGORY */}
                      <td>
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: 800,
                            padding: '3px 8px',
                            borderRadius: '6px',
                            letterSpacing: '0.02em',
                            display: 'inline-block',
                            backgroundColor:
                              p.category === 'GOLD'
                                ? 'var(--color-gold-subtle, rgba(210, 168, 74, 0.12))'
                                : p.category === 'SILVER'
                                ? 'rgba(148, 163, 184, 0.16)'
                                : 'rgba(139, 92, 246, 0.12)',
                            color:
                              p.category === 'GOLD'
                                ? 'var(--color-gold-light, #d2a84a)'
                                : p.category === 'SILVER'
                                ? 'var(--text-primary)'
                                : '#a78bfa',
                            border:
                              p.category === 'GOLD'
                                ? '1px solid rgba(210, 168, 74, 0.28)'
                                : '1px solid var(--border-subtle)'
                          }}
                        >
                          {p.category}
                        </span>
                      </td>

                      {/* PURITY */}
                      <td>
                        <span style={{ fontWeight: 700, color: 'var(--text-dark)', fontSize: '13px' }}>
                          {p.purityValue !== undefined ? `${p.purityValue}` : '—'}
                        </span>
                      </td>

                      {/* RATE / GRAM */}
                      <td>
                        {isOther && !hasCustomRate ? (
                          <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                            Rate not configured
                          </span>
                        ) : (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontWeight: 800, color: 'var(--color-primary-dark)', fontSize: '13.5px' }}>
                              ₹{effectiveRate.toLocaleString('en-IN')} / g
                            </span>
                            {hasCustomRate && (
                              <span style={{ fontSize: '10px', padding: '1px 5px', borderRadius: '4px', backgroundColor: 'var(--bg-surface-secondary)', color: 'var(--text-muted)', fontWeight: 600 }}>
                                Custom
                              </span>
                            )}
                          </div>
                        )}
                      </td>

                      {/* STATUS */}
                      <td>
                        {p.active ? (
                          <span className="badge badge-success" style={{ fontSize: '11px', fontWeight: 800 }}>
                            ● ACTIVE
                          </span>
                        ) : (
                          <span className="badge badge-danger" style={{ fontSize: '11px', fontWeight: 800 }}>
                            ○ DISABLED
                          </span>
                        )}
                      </td>

                      {/* ACTIONS */}
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', alignItems: 'center' }}>
                          {isAuthorized ? (
                            <>
                              <button
                                type="button"
                                className="btn btn-secondary btn-xs"
                                onClick={() => handleOpenEdit(p)}
                                style={{ display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600, padding: '4px 8px' }}
                              >
                                <Edit2 size={12} />
                                <span>Edit</span>
                              </button>

                              <button
                                type="button"
                                className={`btn btn-xs ${p.active ? 'btn-secondary' : 'btn-primary'}`}
                                onClick={() => setTogglingPurity(p)}
                                style={{ display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600, padding: '4px 8px' }}
                              >
                                {p.active ? (
                                  <>
                                    <Ban size={12} color="var(--color-danger, #ef4444)" />
                                    <span style={{ color: 'var(--color-danger, #ef4444)' }}>Disable</span>
                                  </>
                                ) : (
                                  <>
                                    <CheckCircle2 size={12} />
                                    <span>Enable</span>
                                  </>
                                )}
                              </button>

                              {!isUsed && (
                                <button
                                  type="button"
                                  className="btn btn-secondary btn-xs"
                                  onClick={() => setDeletingPurity(p)}
                                  title="Delete unused purity"
                                  style={{ color: 'var(--color-danger, #ef4444)', padding: '4px 6px' }}
                                >
                                  <Trash2 size={12} />
                                </button>
                              )}
                            </>
                          ) : (
                            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Read Only</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ════════════════════════════════════════════════════════════════════════
          MODAL: ADD / EDIT PURITY (Dynamic Form)
          ════════════════════════════════════════════════════════════════════════ */}
      {(isAddModalOpen || editingPurity) && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.65)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '16px'
          }}
        >
          <div
            className="card"
            style={{
              width: '100%',
              maxWidth: '500px',
              backgroundColor: 'var(--bg-card)',
              borderRadius: '16px',
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.35)',
              border: '1px solid var(--border-light)',
              padding: '24px'
            }}
          >
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Sparkles size={18} color="var(--color-primary-accent)" />
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: 'var(--text-dark)' }}>
                  {editingPurity ? `Edit Purity: ${editingPurity.name}` : 'ADD NEW PURITY'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsAddModalOpen(false);
                  setEditingPurity(null);
                }}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Error Banner */}
            {formError && (
              <div style={{ backgroundColor: 'var(--badge-danger-bg)', border: '1px solid var(--badge-danger-border)', color: 'var(--color-danger)', padding: '10px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 700, marginBottom: '14px' }}>
                ⚠ {formError}
              </div>
            )}

            <form onSubmit={handleSavePurity} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* Category Selector */}
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ fontSize: '12px', fontWeight: 700 }}>
                  Category *
                </label>
                <select
                  className="input-control"
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value as PurityCategory)}
                  style={{ height: '38px', fontSize: '13px' }}
                >
                  <option value="GOLD">Gold</option>
                  <option value="SILVER">Silver</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>

              {/* Dynamic Name Input */}
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label required" style={{ fontSize: '12px', fontWeight: 700 }}>
                  {getNameLabel(formCategory)}
                </label>
                <input
                  type="text"
                  className="input-control"
                  placeholder={getNamePlaceholder(formCategory)}
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  autoFocus
                  required
                  style={{ height: '38px', fontSize: '13px' }}
                />
              </div>

              {/* Numeric Purity Value & Rate Row */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" style={{ fontSize: '12px', fontWeight: 700 }}>
                    {formCategory === 'OTHER' ? 'Numeric Value (Optional)' : 'Purity Value (Optional)'}
                  </label>
                  <input
                    type="number"
                    step="any"
                    className="input-control"
                    placeholder={formCategory === 'OTHER' ? 'e.g. 950' : formCategory === 'SILVER' ? 'e.g. 925' : 'e.g. 22'}
                    value={formPurityValue}
                    onChange={(e) => setFormPurityValue(e.target.value)}
                    style={{ height: '38px', fontSize: '13px' }}
                  />
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" style={{ fontSize: '12px', fontWeight: 700 }}>
                    {formCategory === 'OTHER' ? 'Rate / Gram (₹) (Optional)' : 'Custom Rate / Gram (₹)'}
                  </label>
                  <input
                    type="number"
                    step="any"
                    className="input-control"
                    placeholder={formCategory === 'OTHER' ? 'e.g. 4500' : 'e.g. 6400'}
                    value={formRatePerGram}
                    onChange={(e) => setFormRatePerGram(e.target.value)}
                    style={{ height: '38px', fontSize: '13px' }}
                  />
                </div>
              </div>

              {/* Rate hint */}
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '-6px' }}>
                {formCategory === 'OTHER'
                  ? 'If left blank, rate will be marked not configured and won\'t calculate misleading market values.'
                  : formCategory === 'GOLD'
                  ? `Leave blank to calculate proportionally from 22ct benchmark rate (₹${baseGoldRate}/g).`
                  : 'Leave blank to use default silver benchmark rate.'}
              </div>

              {/* Description */}
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ fontSize: '12px', fontWeight: 700 }}>
                  Description (Optional)
                </label>
                <input
                  type="text"
                  className="input-control"
                  placeholder={formCategory === 'OTHER' ? 'e.g. Platinum 95% standard or mixed alloy notes' : 'e.g. Standard 22 Karat gold'}
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  style={{ height: '38px', fontSize: '13px' }}
                />
              </div>

              {/* Active Toggle */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
                <input
                  type="checkbox"
                  id="purityActiveCheckModal"
                  checked={formActive}
                  onChange={(e) => setFormActive(e.target.checked)}
                  style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                />
                <label htmlFor="purityActiveCheckModal" style={{ fontSize: '13px', fontWeight: 700, cursor: 'pointer', color: 'var(--text-dark)' }}>
                  Active (Show in Loan Issue collateral entry dropdown)
                </label>
              </div>

              {/* Modal Footer */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px', borderTop: '1px solid var(--border-subtle)', paddingTop: '14px' }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    setIsAddModalOpen(false);
                    setEditingPurity(null);
                  }}
                  style={{ fontWeight: 600 }}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary btn-sm" style={{ fontWeight: 700 }}>
                  Save Purity
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════════
          MODAL: TOGGLE STATUS (DISABLE / ENABLE)
          ════════════════════════════════════════════════════════════════════════ */}
      {togglingPurity && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.65)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '16px'
          }}
        >
          <div
            className="card"
            style={{
              width: '100%',
              maxWidth: '440px',
              backgroundColor: 'var(--bg-card)',
              borderRadius: '16px',
              border: '1px solid var(--border-light)',
              padding: '22px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
              <div
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '50%',
                  backgroundColor: togglingPurity.active ? 'var(--badge-danger-bg)' : 'var(--badge-success-bg)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                {togglingPurity.active ? <Ban size={18} color="var(--color-danger)" /> : <CheckCircle2 size={18} color="var(--color-primary-accent)" />}
              </div>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: 'var(--text-dark)' }}>
                {togglingPurity.active ? 'Disable Purity Option?' : 'Enable Purity Option?'}
              </h3>
            </div>

            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5, margin: '0 0 16px 0' }}>
              {togglingPurity.active ? (
                <>
                  Disabling <strong>{togglingPurity.name}</strong> will hide it from new loan collateral dropdowns.
                  Existing loans with this purity will remain completely intact.
                </>
              ) : (
                <>
                  Enabling <strong>{togglingPurity.name}</strong> will make it available in new loan collateral dropdowns.
                </>
              )}
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setTogglingPurity(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={`btn btn-sm ${togglingPurity.active ? 'btn-danger' : 'btn-primary'}`}
                onClick={handleConfirmToggle}
                style={{ fontWeight: 700 }}
              >
                {togglingPurity.active ? 'Disable Purity' : 'Enable Purity'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════════
          MODAL: DELETE PURITY CONFIRMATION
          ════════════════════════════════════════════════════════════════════════ */}
      {deletingPurity && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.65)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '16px'
          }}
        >
          <div
            className="card"
            style={{
              width: '100%',
              maxWidth: '440px',
              backgroundColor: 'var(--bg-card)',
              borderRadius: '16px',
              border: '1px solid var(--border-light)',
              padding: '22px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
              <div
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '50%',
                  backgroundColor: 'var(--badge-danger-bg)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <AlertCircle size={18} color="var(--color-danger)" />
              </div>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: 'var(--text-dark)' }}>
                Delete Purity Option?
              </h3>
            </div>

            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5, margin: '0 0 16px 0' }}>
              Are you sure you want to delete <strong>{deletingPurity.name}</strong>? This action cannot be undone.
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setDeletingPurity(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger btn-sm"
                onClick={handleConfirmDelete}
                style={{ fontWeight: 700 }}
              >
                Delete Purity
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
