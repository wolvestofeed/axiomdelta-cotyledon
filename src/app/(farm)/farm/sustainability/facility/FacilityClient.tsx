'use client';

import { useMemo, useState, useSyncExternalStore } from 'react';
import { SUPPORT_PROGRAM_PSM } from '@/data/facility-design';
import { facilityConfigurations, facilityRequirement, facilityRows } from '@/engine/facility';
import { useScenario } from '@/state/scenario-store';
import Link from 'next/link';
import { Card } from '@/components/ui';
import { countsTowardCapital } from '@/engine/equipment';
import type { SavedFacilityLayout } from '@/server/facility';
import type { FacilityView } from '@/app/(farm)/farm/sustainability/facility/facility-view';
import { FacilityDesignTab } from '@/app/(farm)/farm/sustainability/facility/FacilityDesignTab';
import { FacilityFootprintsTab } from '@/app/(farm)/farm/sustainability/facility/FacilityFootprintsTab';
import { FacilitySpaceTab } from '@/app/(farm)/farm/sustainability/facility/FacilitySpaceTab';
import { FacilityConformanceTab } from '@/app/(farm)/farm/sustainability/facility/FacilityConformanceTab';
import { FacilityLayoutTab } from '@/app/(farm)/farm/sustainability/facility/FacilityLayoutTab';
import { FacilityNormalizersTab } from '@/app/(farm)/farm/sustainability/facility/FacilityNormalizersTab';

const TABS = [
  { id: 'plan', label: 'Design & Build plan' },
  { id: 'footprints', label: 'Footprints' },
  { id: 'space', label: 'Space' },
  { id: 'conformance', label: 'Conformance' },
  { id: 'layout', label: 'Layout' },
  { id: 'normalizers', label: 'Normalizers' },
] as const;

type TabId = (typeof TABS)[number]['id'];
const isTab = (v: string): v is TabId => TABS.some((t) => t.id === v);
const readHash = () => window.location.hash.replace(/^#/, '');
const subscribeHash = (cb: () => void) => {
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
};

/**
 * The Facility page: one top tab bar, six panels, one derivation. It sizes a rented commercial
 * facility from the commercial rows of the library as the open forecast phases them
 * (`datedEquipment` carries the forecast's status per line), so a forecast that selects or
 * re-phases equipment re-derives the shell. A home grow room is no building: until a forecast
 * selects a commercial row, only the tabs that size nothing are shown.
 */
const UNSIZED: readonly TabId[] = ['conformance', 'normalizers'];
export function FacilityClient({ canEdit, scenarioKey, scenarioLabel, basis, layouts }: { canEdit: boolean; scenarioKey: string; scenarioLabel: string; basis: 'plan' | 'forecast'; layouts: SavedFacilityLayout[] }) {
  const { resolved } = useScenario();
  // The open tab is the URL hash, so a tab is linkable and survives a refresh; the server renders the first tab.
  const hash = useSyncExternalStore(subscribeHash, readHash, () => '');
  const lines = useMemo(() => resolved.datedEquipment.filter((l) => l.setting === 'commercial'), [resolved.datedEquipment]);
  const selected = lines.some((l) => countsTowardCapital(l.status));
  const tabs = selected ? TABS : TABS.filter((t) => UNSIZED.includes(t.id));
  const tab: TabId = isTab(hash) && tabs.some((t) => t.id === hash) ? hash : tabs[0]!.id;
  const pick = (id: TabId) => {
    window.history.replaceState(null, '', `#${id}`);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  };

  const [psm, setPsm] = useState(SUPPORT_PROGRAM_PSM.value);
  const rows = useMemo(() => facilityRows(lines), [lines]);
  const requirement = useMemo(() => facilityRequirement(lines, { psm }), [lines, psm]);
  const configurations = useMemo(() => facilityConfigurations(lines, psm), [lines, psm]);
  const view: FacilityView = { lines, selected, rows, requirement, configurations, psm, setPsm, canEdit, scenarioKey, scenarioLabel, basis };

  return (
    <>
      {!selected && (
        <Card title="No commercial facility in this forecast" className="mb-4">
          <p className="farm-kpi-sub">The facility is sized from the commercial equipment a forecast selects. This forecast selects none: a home grow room needs no building. Select commercial equipment on <Link className="farm-link" href="/farm/grow-units?setting=commercial">Equipment, Commercial</Link> to size and lay one out.</p>
        </Card>
      )}
      <div className="farm-tabs" role="tablist" aria-label="Facility">
        {tabs.map((t) => (
          <button key={t.id} type="button" role="tab" className="farm-tab" aria-selected={tab === t.id} id={`facility-tab-${t.id}`} aria-controls={`facility-panel-${t.id}`} onClick={() => pick(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="farm-tab-panel" role="tabpanel" id={`facility-panel-${tab}`} aria-labelledby={`facility-tab-${tab}`}>
        {tab === 'plan' && <FacilityDesignTab view={view} />}
        {tab === 'footprints' && <FacilityFootprintsTab view={view} />}
        {tab === 'space' && <FacilitySpaceTab view={view} />}
        {tab === 'conformance' && <FacilityConformanceTab />}
        {tab === 'layout' && <FacilityLayoutTab view={view} layouts={layouts} />}
        {tab === 'normalizers' && <FacilityNormalizersTab view={view} />}
      </div>
    </>
  );
}
