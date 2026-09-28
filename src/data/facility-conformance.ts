/**
 * Cotyledon — the facility conformance register (facility-design-roadmap.md §4, §10).
 *
 * Every item is marked by what it is: CODE (a section can be cited and an
 * inspector can enforce it), SCHEME (a certification standard, binding only if
 * the farm is audited against it), GUIDANCE (a published rule of thumb or a
 * manufacturer's requirement), or CONVENTION (published design practice, no
 * force). The distinction is the point: most of what circulates as "farm
 * code" is convention, and a design document that blurs the two will not
 * survive an Austin Public Health plan review.
 *
 * Co-versioned with the build plan: an item changes here and there together.
 * A `check` names the layout check the facility engine runs against a drawn
 * plan; items without one are answered on the finish schedule, the fixture
 * spec or the submission, not by geometry.
 */

export type ConformanceStatus = 'CODE' | 'SCHEME' | 'GUIDANCE' | 'CONVENTION';

export const CONFORMANCE_STATUS_LABELS: Record<ConformanceStatus, string> = {
  CODE: 'Code',
  SCHEME: 'Scheme',
  GUIDANCE: 'Guidance',
  CONVENTION: 'Convention',
};

export const CONFORMANCE_STATUS_MEANING: Record<ConformanceStatus, string> = {
  CODE: 'A section can be cited and an inspector can enforce it.',
  SCHEME: 'A certification standard; binding only if the farm is audited against it.',
  GUIDANCE: 'A published rule of thumb or a manufacturer\'s installation requirement.',
  CONVENTION: 'Published design practice with no force.',
};

/** The layout checks the engine can run on a drawn plan. */
export type LayoutCheckKind =
  | 'aisle_min'
  | 'clearance'
  | 'spine_width'
  | 'hood_overhang'
  | 'dish_machine_drain'
  | 'hand_sink_travel'
  | 'walk_in_apron'
  | 'inside_shell'
  | 'two_streams'
  | 'egress';

export interface ConformanceItem {
  id: string;
  requirement: string;
  status: ConformanceStatus;
  authority: string;
  /** What it does to the floor plan. */
  consequence: string;
  /** Where a status needs qualifying: local, international, performance-only, advisory. */
  qualifier?: string;
  check?: LayoutCheckKind;
}

/** §4: the standards behind the space method, and which of them are actually code. */
export const SPACE_STANDARDS: readonly ConformanceItem[] = [
  { id: 'S-01', requirement: 'Hood canopy overhangs the growing surface by 6 in on all open sides; front lip no more than 4 ft above the surface.', status: 'CODE', authority: 'International Mechanical Code §507.4.1 (§507.1.6.1 in some editions). A UL 710 listing\'s own overhang governs over this baseline.', consequence: 'Hood run length = the units under it plus 6 in at each open end.', check: 'hood_overhang' },
  { id: 'S-02', requirement: 'Accessible route clear width 36 in, narrowing to 32 in for runs up to 24 in.', status: 'CODE', authority: '2010 ADA Standards §403.5.1; ICC A117.1 §403.5.1', consequence: 'Every aisle in the zone factors exceeds this.', check: 'aisle_min' },
  { id: 'S-03', requirement: 'Egress aisle not less than 36 in; nonpublic aisles serving fewer than 50 need not exceed 28 in.', status: 'CODE', authority: 'IBC §1018.2.2', consequence: 'The floor of every aisle width.', check: 'aisle_min' },
  { id: 'S-04', requirement: 'Corridors 44 in, or 36 in where occupant load is under 50.', status: 'CODE', authority: 'IBC Table 1020.3', consequence: 'Corridors in the support program.' },
  { id: 'S-05', requirement: 'Walk-in envelope minimum R-25.', status: 'CODE', authority: '10 CFR 431 Subpart R', consequence: 'Walk-in panel specification; no floor area.' },
  { id: 'S-06', requirement: 'Aisles must have sufficient safe clearance where mechanical handling is used. No number is given.', status: 'CODE', qualifier: 'performance only', authority: '29 CFR 1910.176(a)', consequence: 'OSHA states no aisle width; the 3 ft or 4 ft figure repeated in trade material is not in the rule.' },
  { id: 'S-07', requirement: 'Single aisle with protruding equipment 54 in; double aisle with protruding equipment 72 in; single aisle, limited equipment 36 in; double 54 in; little traffic 48 in; major traffic 72 in.', status: 'GUIDANCE', authority: 'UC Berkeley UHS Dining Design Guidelines, Space Requirements appendix', consequence: 'The aisle in every zone factor.', check: 'aisle_min' },
  { id: 'S-08', requirement: 'Traffic aisle where mobile equipment travels 4 ft; between two work tables 3.5 ft; between shelving 4 ft minimum; 4 linear ft of work table per production employee.', status: 'GUIDANCE', qualifier: 'dated, 1973', authority: 'USOE, Design Criteria: Prospect Food Service Facilities, 1973', consequence: 'The cold-storage front clearance.' },
  { id: 'S-09', requirement: 'Personnel with carts need about 40 in of aisle clearance.', status: 'GUIDANCE', authority: 'Foodservice Equipment Reports', consequence: 'The harvest marshalling lane and the spine.', check: 'spine_width' },
  { id: 'S-10', requirement: 'Equipment occupies about 30% of a farm\'s area.', status: 'GUIDANCE', qualifier: 'single source, uncorroborated', authority: 'Thibodeaux, Restaurant Design: Concept to Subscriber', consequence: 'A cross-check only. This model derives aisles unit by unit and lands at 42%; the divergence is the direction that tightens if a designer disagrees.' },
  { id: 'S-11', requirement: '2 in clearance around walk-in panel exteriors; top-mount systems 4 in above and 24 in each side; remote condenser 12 in minimum (18 preferred) at the coil face and 24 in at the service end.', status: 'GUIDANCE', qualifier: 'manufacturer installation requirements', authority: 'U.S. Cooler, Master-Bilt', consequence: 'The 2 in panel clearance on every walk-in box.', check: 'walk_in_apron' },
  { id: 'S-12', requirement: 'Walk-in interior clear is roughly nominal minus twice the panel thickness (about 8 in per dimension at 4 in panels); some makers size to nominal, others to actual.', status: 'GUIDANCE', authority: 'U.S. Cooler, Norlake', consequence: 'The two Phase 1 boxes are 31% of the Phase 1 production floor, so the convention is not a rounding question.' },
  { id: 'S-13', requirement: 'Rack conveyor dishwasher needs 20 in service clearance on both long faces; total line length including load and unload tables is not published by any manufacturer.', status: 'GUIDANCE', authority: 'Hobart CL44eN and CLPS76eN spec sheets; Champion 80 PRO-HD', consequence: 'The warewash zone factor and the derived warewash room.' },
  { id: 'S-14', requirement: 'Farm area per unit: 0.9 sq ft at 1,000–2,000 units/day (1973, reheat era) against about 1.0 sq ft per unit for fresh production, with fresh prep needing roughly twice a heat-and-serve farm.', status: 'GUIDANCE', qualifier: 'sources differ by up to 5×', authority: 'USOE 1973; Marshall / The Marshall Associates', consequence: 'A per-unit cross-check; both figures describe a pickup point farm, not a facility that blackouts, packages, holds and ships.' },
  { id: 'S-15', requirement: 'Food service net-to-department-gross factor 1.40; program allowances by Peak Single Units.', status: 'GUIDANCE', qualifier: 'mandatory on federal projects', authority: 'DoD Space Planning Criteria Ch. 510, 2015', consequence: 'The support program and its gross-up.' },
];

/** Two corrections worth carrying, because both are repeated constantly in trade material and both are wrong. */
export const STANDARD_CORRECTIONS: readonly string[] = [
  'NFPA 96 does not state the 6 in hood overhang: its Chapter 5 is performance language, and the 6 in figure is the IMC.',
  'OSHA does not require a 3 ft or 4 ft aisle: 29 CFR 1910.176(a) has no number in it.',
];

/** §10.1: what law actually applies in Austin, Texas. */
export const LEGAL_BASIS = {
  summary: 'Texas does not write its own food construction code. 25 TAC §228.1 adopts the FDA Food Code 2017 and its Supplement by reference, effective 2021-08-08, and keeps only a short list of Texas amendments; there is no Texas amendment on handwashing sinks, warewashing, ventilation, dressing rooms, toilets, garbage or backflow. Requirements are therefore cited as Food Code 2017 sections as adopted by 25 TAC §228.1, not as TFER sections. Texas has not adopted the 2022 Food Code.',
  note: 'DSHS\'s currently-posted guidance still cites 2015-era TFER numbers (§228.75, §228.76, §228.244) that no longer carry that content under the 2021 chapter; citing Food Code sections is correct regardless of which text a reviewer is working from.',
  texasRules: [
    { rule: '25 TAC §228.171', requirement: 'Walls, wall coverings and ceilings of walk-ins, food prep areas, warewash areas, toilet rooms and vestibules should be light in color, or meet the regulatory authority\'s approval; darker colors may require additional lighting per Food Code 6-303.11.', note: 'Drafted "should": advisory with a discretionary hook. Treated as the default.' },
    { rule: '25 TAC §228.241, §228.243', requirement: 'Plans may be required by the regulatory authority; the authority may conduct preoperational inspections against the approved plans.', note: 'The state makes plan review discretionary. Austin makes it mandatory.' },
  ],
  haccpHooks: 'Texas does not adopt Food Code 8-201.11 or 8-203.10 (replaced by §228.241 / §228.243) but does adopt 8-201.12 (contents of plans), 8-201.13 and 8-201.14 (when a HACCP plan is required and what it contains), and 8-103.10 / .11 / .12 (variances). Those are the legal hooks for the grow HACCP plan, which goes to Austin Public Health, the local regulatory authority, before implementation.',
  planReview: 'Austin Public Health requires plan review for new construction and remodels, one of three gates before opening with the pre-opening inspection and the operational permit; the new-construction fee is $312. Plans to scale at 1/4 in = 1 ft on a sheet of at least 11 × 14 in, showing every piece of equipment, plumbing, electrical and mechanical ventilation, room dimensions and minimum aisle space and spacing between equipment, an equipment list keyed to the plan with spec sheets, the proposed menu, plumbing details, hot water capacity and recovery rate, ventilation for each room, the mop sink, the toxic chemical store, separate storage for employee personal items, refrigerated and frozen storage adequacy, a finish schedule and lighting levels in foot-candles. The grease interceptor is a separate Austin Water matter under Chapter 15-10.',
} as const;

/** §10.2: Food Code 3-502.12(D), the grow paragraph. No variance is needed where it is met (3-502.11(D)). */
export const SOW_BLACKOUT_RULE = {
  summary: 'Food Code 3-502.11(D) requires a variance for reduced oxygen packaging except where 3-502.12 is met, so a compliant grow operation does not need one. Without a variance the operation must sow to 3-401.11 parameters; seal the package before growing, or immediately after growing and before the food falls below 135°F; cool to 41°F in the sealed package per 3-501.14; hold in a unit with continuous electronic time and temperature monitoring, visually examined twice daily; label with product name and packaging date; keep records 6 months; and operate to written procedures and a training program.',
  paths: [
    { path: '(a)', requirement: 'Cooled to 34°F within 48 hours of reaching 41°F, held there', shelfLife: '30 days from packaging', current: false },
    { path: '(b)', requirement: 'Cooled to 34°F within 48 hours, then removed to 41°F or less', shelfLife: '72 hours after removal', current: false },
    { path: '(c)', requirement: 'Held at 41°F or less, no 34°F stage', shelfLife: '7 days', current: true },
    { path: '(d)', requirement: 'Frozen', shelfLife: 'No limit while frozen', current: false },
  ],
  statusNote: 'On the equipment as listed the legal shelf life is 7 days, path (c). This is the current operational status; the 30-day path (a) is a potential room on the Design and Build plan.',
} as const;

/** §10.4: the conformance register the block plan is drawn against and a plan review submission answers. */
export const CONFORMANCE_REGISTER: readonly ConformanceItem[] = [
  { id: 'C-01', requirement: 'Raw animal food separated from raw and harvested ready-to-eat food during storage, prep, holding and display. Types of raw animal food separated from each other by separate equipment, by arrangement, or by preparing at different times or in separate areas.', status: 'CODE', authority: 'Food Code 3-302.11, per 25 TAC §228.1', consequence: 'Satisfied by time separation; it does not require a wall. A dedicated raw protein prep area is a choice, a documented time-separation SOP the alternative. Open decision.' },
  { id: 'C-02', requirement: 'One-directional flow: layout and movement of personnel and material such that cross-contamination is prevented, using physical separation, distance and traffic flow.', status: 'CODE', qualifier: 'international', authority: 'Codex CXC 1-1969 §9.1.2', consequence: 'Receiving → storage → prep → hot → blackout → pack → cold hold → harvest, with no loop and no cross-back. Drives the spine route.', check: 'two_streams' },
  { id: 'C-03', requirement: 'Drainage does not flow from raw production or toilet areas toward areas where finished food is exposed.', status: 'CODE', qualifier: 'international', authority: 'Codex CXC 1-1969 §9.2.1', consequence: 'A sprouting-rack-bay trench cannot discharge under or toward the packaging room.' },
  { id: 'C-04', requirement: 'Handwashing sinks in food prep, food dispensing and warewashing areas, in a number necessary for convenient use; located to allow convenient use and in or immediately adjacent to toilet rooms.', status: 'CODE', authority: 'Food Code 5-203.11, 5-204.11, 6-401.10', consequence: 'Sinks at each work zone. No travel distance is codified; see C-05.', check: 'hand_sink_travel' },
  { id: 'C-05', requirement: '25 ft maximum travel to a hand sink.', status: 'CONVENTION', qualifier: 'code in WA, NYC and NV; not in the Food Code, 25 TAC 228 or the APH application', authority: 'WAC 246-215-05255; NYC Rules §81.21; NAC 446.581', consequence: 'Adopted as a self-imposed design standard to satisfy 5-204.11\'s "convenient use" criterion, and labelled as such. APH\'s own page says "hand sinks in all prep, dish and service areas": firmer than the Food Code, still not numeric.', check: 'hand_sink_travel' },
  { id: 'C-06', requirement: 'Handwashing at the point of entry to a production area.', status: 'SCHEME', authority: 'BRCGS 4.8.4, 7.2.2, 8.4', consequence: 'A hand sink inside the packaging room vestibule. Not a Food Code requirement: the Food Code governs when to wash (2-301.14), not room-entry geometry.' },
  { id: 'C-07', requirement: 'Hands-free taps, liquid soap, single-use towels or air dryer, signage at each station.', status: 'SCHEME', qualifier: 'soap and drying are code; hands-free is scheme', authority: 'BRCGS 4.8.4; Food Code 6-301.11, 6-301.12', consequence: 'Fixture specification; no floor area.' },
  { id: 'C-08', requirement: 'Poisonous or toxic materials stored so they cannot contaminate food, equipment, utensils, linens or single-service articles: separated by spacing or partitioning and not located above them.', status: 'CODE', authority: 'Food Code 7-201.11', consequence: 'The chemical store is a separate room in the support program. Warewash-area cleaners and sanitisers are exempted where contamination cannot result.' },
  { id: 'C-09', requirement: 'Floors, walls and ceilings smooth and easily cleanable.', status: 'CODE', authority: 'Food Code 6-201.11', consequence: 'Finish schedule. The leasehold line for urethane or quarry tile flooring is the response.' },
  { id: 'C-10', requirement: 'Water-flush cleaned areas: floor and wall junctures coved and sealed, floors graded to drain, floor drains provided. Where flush cleaning is not used, junctures coved and closed to no more than 1 mm (1/32 in).', status: 'CODE', authority: 'Food Code 6-201.13(A), (B)', consequence: 'The code basis for the trench and area drains. The 3/8 in or 1 in cove radius everyone specifies is not a Food Code dimension; the 1 mm maximum gap is the only codified figure.' },
  { id: 'C-11', requirement: 'No open rafters or exposed ductwork in food areas.', status: 'CODE', qualifier: 'local', authority: 'Austin Public Health, Fixed Food Establishments', consequence: 'Finished ceiling throughout production. Interacts with hood and walk-in top closure.' },
  { id: 'C-12', requirement: 'Light-coloured walls and ceilings in walk-ins, prep, warewash, toilet rooms and vestibules.', status: 'CODE', qualifier: 'state, advisory: drafted "should"', authority: '25 TAC §228.171', consequence: 'Finish schedule default.' },
  { id: 'C-13', requirement: 'Lighting: 10 fc in walk-ins and dry storage, 20 fc at handwashing, warewashing and toilet areas, 50 fc where food is worked with knives or slicers.', status: 'CODE', authority: 'Food Code 6-303.11; restated by APH', consequence: 'Fixture layout per zone.' },
  { id: 'C-14', requirement: 'Mechanical ventilation of sufficient capacity to keep rooms free of excessive heat, steam, condensation, vapours, odours, smoke and fumes.', status: 'CODE', qualifier: 'performance only', authority: 'Food Code 6-304.11', consequence: 'No CFM, no capture velocity and no hood type in the food code; the numbers come from the Austin-adopted IMC and NFPA 96.' },
  { id: 'C-15', requirement: 'Hood canopy overhangs the appliance by 6 in on all open sides; front lip no more than 4 ft above the growing surface.', status: 'CODE', authority: 'IMC §507.4.1', consequence: 'The hood linear feet by phase.', check: 'hood_overhang' },
  { id: 'C-16', requirement: 'Hood to combustible construction 18 in; 3 in to limited-combustible; 0 to noncombustible. Grease duct 18 in to combustible.', status: 'CODE', authority: 'IMC §507.2.6, §506.3.6; NFPA 96 §4.2', consequence: 'Drives clear height in the sow bay.' },
  { id: 'C-17', requirement: 'Grease filter to flame: 0.5 ft no exposed flame, 2 ft exposed flame, 3.5 ft charbroiler.', status: 'CODE', authority: 'IMC Table 507.2.8', consequence: 'The Phase 3 charbroiler sets the tallest requirement.' },
  { id: 'C-18', requirement: 'Designated dressing area if employees routinely change on pickup point; lockers for orderly storage of clothing and possessions, located where contamination cannot occur.', status: 'CODE', authority: 'Food Code 6-305.11, 6-403.11', consequence: 'A facility with shift change triggers this: a requirement, not an amenity. No minimum area, locker count or separate-room requirement in code. The support program carries two 120 sq ft changing rooms.' },
  { id: 'C-19', requirement: 'Personnel route: entry → lockers → changing → footwear change over a bench barrier → gown → hand wash → sanitise → zone.', status: 'SCHEME', qualifier: 'scheme and convention', authority: 'BRCGS 8.4; ECFF §2.2.4; Techni-K', consequence: 'The packaging room vestibule. No published dimension exists for a changing room per person or a step-over barrier.' },
  { id: 'C-20', requirement: 'At least one toilet and not fewer than required by law; conveniently located and accessible during all hours of operation.', status: 'CODE', authority: 'Food Code 5-203.12, 6-402.11', consequence: 'Fixture count is not in the food code; it comes from the Austin-adopted plumbing code occupancy table.' },
  { id: 'C-21', requirement: 'At least one service sink or curbed cleaning facility with a floor drain, conveniently located. A toilet may not be used as a service sink.', status: 'CODE', authority: 'Food Code 5-203.13', consequence: 'On the equipment list within "Hand sinks and mop sink". Austin adds backflow prevention on it.' },
  { id: 'C-22', requirement: 'Supply-side air gap at least twice the diameter of the water supply inlet, never less than 1 inch.', status: 'CODE', authority: 'Food Code 5-202.13', consequence: 'The one hard number in this area.' },
  { id: 'C-23', requirement: 'No direct connection between the sewage system and a drain from equipment holding food, portable equipment or utensils. Exceptions: a floor drain originating in a refrigerated space structurally part of the building; a warewashing machine within 5 ft of a trapped floor drain.', status: 'CODE', authority: 'Food Code 5-402.11', consequence: 'Prep sinks, sprouting racks, shelves, ice, dipper wells and walk-in condensate discharge indirectly through an air gap to a floor sink. The dish machine\'s drain within 5 ft.', check: 'dish_machine_drain' },
  { id: 'C-24', requirement: 'Commercial sinks, scullery sinks, dishwashing machines and similar fixtures connected to the drainage system indirectly.', status: 'CODE', qualifier: 'local', authority: 'Austin City Code §25-12-153, UPC §704.3', consequence: 'The cleaner Austin citation for indirect waste.' },
  { id: 'C-25', requirement: 'Food waste and garbage disposal units are prohibited in commercial farms unless approved under §301.3.', status: 'CODE', qualifier: 'local', authority: 'Austin City Code §25-12-153, UPC §616.0', consequence: 'No disposer on the equipment list. The pot sink carries two drainboards and scrap goes by hand to the refrigerated waste room in the support program.' },
  { id: 'C-26', requirement: 'Grease interceptor required for commercial or institutional food preparation facilities, expressly including facilities serving prospects. Minimum 100 gal; minimum 500 gal where there is a dishwasher. Sizing: fixture units × 3 gpm × 12 min. Two compartments, first at 7-minute retention, second at 5.', status: 'CODE', qualifier: 'local', authority: 'Austin City Code Ch. 15-10; §25-12-153 UPC §1014.1, §1014.1.3; Austin Water sizing criteria', consequence: 'The leasehold line for the grease interceptor is the response. Pumped every 90 days or at 50% wetted height; manifests kept 3 years; City-permitted haulers only.' },
  { id: 'C-27', requirement: 'Each fixture individually trapped and vented; trap seal primers on infrequently used floor drains.', status: 'CODE', qualifier: 'local', authority: '§25-12-153, UPC §1014.1.1, §1007.0', consequence: 'Plumbing rough.' },
  { id: 'C-28', requirement: 'Trench drain under the dish machine discharge; floor drains positioned under the sprouting rack and shelf dump arc; floor sinks for ice, steamers and combis; separate condensate lines from walk-ins; floor slope 1/8 to 1/4 in per foot.', status: 'CONVENTION', authority: 'Aldevra, drainage design guidance', consequence: 'No code requires a trench drain anywhere. The code requirement is 6-201.13(B): graded to drain with drains provided.' },
  { id: 'C-29', requirement: 'Floor drains prohibited inside walk-ins except in refrigerated processing rooms.', status: 'CONVENTION', qualifier: 'institutional standards', authority: 'UMN Div. 13 00 30; McLean County', consequence: 'Cold storage layout.' },
  { id: 'C-30', requirement: 'Outdoor refuse storage on a smooth, durable, nonabsorbent surface graded to drain.', status: 'CODE', authority: 'Food Code 5-501.11, 6-405.10', consequence: 'Dock apron, outside the building gross.' },
  { id: 'C-31', requirement: 'Waste and soiled ware leave by a route that does not cross clean product flow; high-risk waste by a dedicated route.', status: 'SCHEME', qualifier: 'scheme and convention; no US code requirement', authority: 'BRCGS 4.12, 4.12.3, 8.6; SQF 11.8; Codex §9.1.2', consequence: 'Waste egress on the opposite side of the spine from the pack room.' },
  { id: 'C-32', requirement: 'Soiled dish table does not drain into the wash compartment; scupper the full flat section.', status: 'CONVENTION', qualifier: 'institutional standard', authority: 'UMN Div. 13 00 30 Part 20 §3.ii.C', consequence: 'Warewash room detail.' },
  { id: 'C-33', requirement: 'Accessible route: 36 in clear, 32 in at pinch points up to 24 in long; 60 × 60 in passing spaces where the route is under 60 in.', status: 'CODE', authority: '2010 ADA Standards §403.5.1–.3', consequence: 'Every aisle in the zone factors exceeds this. The spine at 5 ft does not require passing spaces.', check: 'aisle_min' },
  { id: 'C-34', requirement: 'Egress aisle not less than 36 in; corridors 44 in, or 36 in where occupant load is under 50; capacity 0.2 in per occupant.', status: 'CODE', authority: 'IBC §1018.2.2, Table 1020.3, §1005.3', consequence: 'Two exits and travel distance to be checked against the drawn plan.', check: 'egress' },
  { id: 'C-35', requirement: 'Ceiling height: no food-specific minimum in the Food Code or the model codes; IBC baseline 7 ft 6 in for occupiable space.', status: 'CODE', qualifier: 'general; some jurisdictions set 8 ft for food establishments, and Austin\'s own figure is unverified', authority: 'IBC 1208.2', consequence: 'Design rule: 12–14 ft clear in the sow and sprouting rack bay for a hood bottom at 78–84 in above floor plus hood depth plus grease duct at 18 in combustible clearance; 10 ft clear in the packaging room for the panel ceiling and refrigeration piping; walk-in tops closed to structure or louvred.' },
];

/** §10.5: eleven zones in flow order, and what the block plan resolves them against. */
export const ZONE_ADJACENCY: readonly { zone: string; adjacentTo: string; separatedFrom: string; items: string }[] = [
  { zone: 'Receiving dock', adjacentTo: 'Dry store, cold store, receiving scale', separatedFrom: 'Waste egress, finished goods harvest', items: 'C-02, C-30' },
  { zone: 'Dry and chemical store', adjacentTo: 'Receiving, prep', separatedFrom: 'Food contact surfaces (chemicals not above food)', items: 'C-08' },
  { zone: 'Cold store (walk-ins)', adjacentTo: 'Receiving, prep, and the blackout outfeed', separatedFrom: '—', items: 'C-29; the 34°F room' },
  { zone: 'Raw protein prep', adjacentTo: 'Cold store, hot line', separatedFrom: 'RTE handling and the packaging room', items: 'C-01' },
  { zone: 'Prep (produce and RTE)', adjacentTo: 'Cold store, hot line', separatedFrom: 'Raw protein handling', items: 'C-01' },
  { zone: 'Hot line (sprouting rack, shelf, jar stand)', adjacentTo: 'Prep infeed, both blackout racks', separatedFrom: '—', items: 'C-14 to C-17, C-28' },
  { zone: 'Grow (2 racks, blackout carts)', adjacentTo: 'Hot line discharge, packaging, cold store', separatedFrom: '—', items: 'C-28; 3-502.12(D)' },
  { zone: 'Packaging', adjacentTo: 'Blackout outfeed, finished goods cold store', separatedFrom: 'Raw prep, warewash, waste, drainage from the sprouting rack bay', items: 'C-03, C-06, C-19' },
  { zone: 'Finished goods cold store', adjacentTo: 'Packaging, harvest staging', separatedFrom: 'Raw materials', items: '3-502.12(D) monitoring' },
  { zone: 'Harvest staging', adjacentTo: 'Finished goods, dock', separatedFrom: 'Receiving flow, waste', items: 'C-02' },
  { zone: 'Warewash', adjacentTo: 'Pot and pan return from all zones, clean ware back to prep and pack', separatedFrom: 'Clean product flow', items: 'C-31, C-32, C-23' },
];

/** The two-stream hot line (§10.5): a layout rule, not a code. */
export const TWO_STREAM_RULE = 'Phase 1 runs one 100 gal sprouting rack, one 40 gal tilting shelf and one 20-pan jar stand feeding two blackoutRacks. Two concurrent sow→blackout streams are achieved by grow unit assignment, not duplicate equipment: the sprouting rack on one component to rack A while the shelf and jar stand work another to rack B. Both racks must be reachable from the hot line without the two streams crossing, which rules out stacking both racks at one end of a single aisle. Positions for the Phase 2 second line are reserved so nothing relocates when it lands.';

/** The numeric limits the layout checks run against. */
export const LAYOUT_LIMITS = {
  /** IBC §1018.2.2 / ADA §403.5.1: the narrowest an aisle between equipment may be. */
  aisleMinIn: 36,
  /** The cart spine, feet clear (design rule, see S-09). */
  spineMinFt: 5,
  /** Food Code 5-402.11: a warewashing machine within this of a trapped floor drain. */
  dishMachineDrainMaxFt: 5,
  /** Self-imposed (C-05): maximum travel from a work position to a hand sink. */
  handSinkTravelMaxFt: 25,
  /** IMC §507.4.1. */
  hoodOverhangIn: 6,
  /** IBC: two exits where required; checked as a count on the drawn plan. */
  exitsMin: 2,
} as const;
