import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  ACTIVE_FLEET_TABS,
  DEFAULT_FLEET_TAB,
  DEFERRED_FLEET_TABS,
  PLACEHOLDER_FLEET_TABS,
  VISIBLE_FLEET_TABS,
  isActiveFleetTab,
  isDeferredFleetTab,
  isPlaceholderFleetTab,
} from './activeFleetScope.ts';
import { NAV_SECTIONS } from '../../routes/navigation.ts';

const here = path.dirname(fileURLToPath(import.meta.url));

function read(rel: string) {
  return fs.readFileSync(path.join(here, rel), 'utf8');
}

describe('Fleet Operations active scope', () => {
  it('exposes five production tabs plus a FASTAG placeholder', () => {
    assert.deepEqual([...ACTIVE_FLEET_TABS], [
      'entry',
      'history',
      'permits',
      'emi',
      'analytics',
    ]);
    assert.deepEqual([...PLACEHOLDER_FLEET_TABS], ['fastag']);
    assert.deepEqual([...VISIBLE_FLEET_TABS], [
      'entry',
      'history',
      'permits',
      'emi',
      'analytics',
      'fastag',
    ]);
    assert.equal(DEFAULT_FLEET_TAB, 'entry');
    assert.deepEqual([...DEFERRED_FLEET_TABS], ['dashboard', 'reports', 'expenses']);
    assert.equal(isActiveFleetTab('fastag'), false);
    assert.equal(isPlaceholderFleetTab('fastag'), true);
    assert.equal(isActiveFleetTab('dashboard'), false);
    assert.equal(isDeferredFleetTab('dashboard'), true);
  });

  it('does not expose Dashboard, Reports, or Expenses in sidebar navigation', () => {
    const vehicles = NAV_SECTIONS.find((section) => section.id === 'vehicles');
    assert.ok(vehicles);
    const labels = (vehicles?.children ?? []).map((child) => child.label.toLowerCase());
    const paths = (vehicles?.children ?? []).map((child) => child.path);
    assert.equal(labels.some((label) => label.includes('dashboard') || label.includes('overview')), false);
    assert.equal(labels.some((label) => label === 'reports' || label.includes('expense')), false);
    assert.equal(paths.some((pathValue) => pathValue.includes('tab=dashboard')), false);
    assert.equal(paths.some((pathValue) => pathValue.includes('tab=reports')), false);
    assert.equal(paths.some((pathValue) => pathValue.includes('tab=expenses')), false);
    for (const tab of VISIBLE_FLEET_TABS) {
      assert.ok(paths.some((pathValue) => pathValue.includes(`tab=${tab}`)));
    }
    assert.ok(labels.some((label) => label.includes('fastag')));
  });

  it('preserves deferred page, hook, and component files', () => {
    const files = [
      'pages/FleetDashboardPage.tsx',
      'pages/VehicleReportsPage.tsx',
      'pages/VehicleExpenseReportPage.tsx',
      'hooks/useFleetDashboardData.ts',
      'hooks/useFastagData.ts',
      'components/fastag/FastagSummaryTiles.tsx',
      'components/dashboard/DailyStatTiles.tsx',
      'components/reports/ReportFilters.tsx',
    ];
    for (const file of files) {
      assert.equal(fs.existsSync(path.join(here, file)), true, file);
    }
  });

  it('does not mount or import deferred modules from the active Fleet page', () => {
    const source = read('pages/FleetPages.tsx');
    assert.match(source, /lazy\(/);
    assert.match(source, /FleetTabSkeleton/);
    assert.match(source, /MaintenanceEntryPage/);
    assert.doesNotMatch(source, /import MaintenanceHistoryPage from/);
    assert.doesNotMatch(source, /import VehicleAnalyticsPage from/);
    assert.doesNotMatch(source, /import EmiLoansPage from/);
    assert.match(source, /DEFERRED/);
    assert.doesNotMatch(source, /from ["']\.\/FleetDashboardPage["']/);
    assert.doesNotMatch(source, /from ["']\.\/VehicleReportsPage["']/);
    assert.doesNotMatch(source, /from ["']\.\/VehicleExpenseReportPage["']/);
    assert.doesNotMatch(source, /useFleetDashboardData/);
    assert.doesNotMatch(source, /useExpenseReportData/);
    assert.doesNotMatch(source, /useTrips/);
  });

  it('does not register deferred dashboard/reports/expenses routes as active', () => {
    const routesSource = read('routes.tsx');
    assert.match(routesSource, /DEFERRED/);
    assert.equal(/^\s*path:\s*'fleet\/dashboard'/m.test(routesSource), false);
    assert.equal(/^\s*path:\s*'fleet\/reports'/m.test(routesSource), false);
    assert.equal(/^\s*path:\s*'fleet\/expense-report'/m.test(routesSource), false);
    assert.equal(/^\s*element: withSuspense\(FleetDashboardPage\)/m.test(routesSource), false);
  });

  it('does not initialize deferred APIs from active Fleet fetch/cache/refresh paths', () => {
    const files = [
      'hooks/useAnalyticsData.ts',
      'hooks/useEmiData.ts',
      'hooks/useMaintenanceData.ts',
      'hooks/useDocumentsData.ts',
      'services/fleetSessionCache.ts',
    ];
    const joined = files.map((file) => read(file)).join('\n');
    assert.equal(joined.includes('fleet/dashboard'), false);
    assert.equal(joined.includes('/fleet/reports'), false);
    assert.equal(joined.includes('expense-report'), false);
    assert.equal(joined.includes("fleetCacheInvalidate('dash:"), false);
    assert.equal(joined.includes('useFleetDashboardData'), false);
    assert.equal(joined.includes('useExpenseReportData'), false);
  });

  it('Analytics fetches only via filter-key cache, refresh nonce, and shared GET — no polling', () => {
    const source = read('hooks/useAnalyticsData.ts');
    assert.match(source, /fleetSharedGet/);
    assert.match(source, /filterKey/);
    assert.match(source, /refreshNonce/);
    assert.doesNotMatch(source, /setInterval/);
    assert.doesNotMatch(source, /setTimeout\(\s*\(\)\s*=>\s*\{?\s*refresh/);
  });

  it('EMI Retry is a single controlled list GET with in-flight protection', () => {
    const source = read('hooks/useEmiData.ts');
    assert.match(source, /listInFlight/);
    assert.match(source, /if \(listInFlight\.current\) return/);
    assert.match(source, /emiApi/);
    assert.match(source, /\.overview\(/);
    assert.doesNotMatch(source, /setInterval/);
  });

  it('EMI data hook is read-only — no schedule or payment path', () => {
    const source = read('hooks/useEmiData.ts');
    assert.doesNotMatch(source, /savingRef/);
    assert.doesNotMatch(source, /resolvePayKey/);
    assert.doesNotMatch(source, /fleet:emi-pay:/);
    assert.doesNotMatch(source, /idempotencyKey/);
    assert.doesNotMatch(source, /\.pay\(/);
    assert.doesNotMatch(source, /listSchedule/);
  });

  it('Maintenance Entry does not load History list or meter-summary', () => {
    const source = read('hooks/useMaintenanceData.ts');
    assert.match(source, /if \(scope === 'history'\)/);
    assert.match(source, /if \(scope === 'entry'\)/);
    assert.match(source, /if \(scope !== 'history'\) return/);
    assert.match(source, /meter-summary/);
    const entryPage = read('pages/MaintenanceEntryPage.tsx');
    assert.match(entryPage, /useMaintenanceData\('entry'\)/);
    const historyPage = read('pages/MaintenanceHistoryPage.tsx');
    assert.match(historyPage, /useMaintenanceData\('history'\)/);
  });

  it('Permit fetches are a single controlled list with session-cache sharing', () => {
    const source = read('hooks/useDocumentsData.ts');
    assert.match(source, /fleetSharedGet\('permits:list'/);
    assert.match(source, /permitApi\.list/);
    assert.doesNotMatch(source, /setInterval/);
    assert.doesNotMatch(source, /permitApi\.summary/);
  });

  it('FASTAG is a static Under Construction screen with no data path', () => {
    const source = read('pages/FastagDashboardPage.tsx');
    const live = source.split('export default memo(FastagDashboardPage);')[1] || source.slice(source.lastIndexOf('UNDER CONSTRUCTION'));
    assert.match(source, /Under Construction/);
    assert.match(source, /Coming Soon/);
    assert.match(source, /FASTAG Management/);
    assert.match(source, /future release/i);
    assert.doesNotMatch(live, /useFastagData\(/);
    assert.doesNotMatch(live, /useVehicles\(/);
    assert.doesNotMatch(live, /getFastags/);
    assert.doesNotMatch(live, /localStorage/);
    assert.doesNotMatch(live, /sessionStorage/);
    assert.doesNotMatch(live, /fleetCache/);
    assert.doesNotMatch(live, /apiClient/);
    assert.doesNotMatch(live, /fetch\(/);
    assert.doesNotMatch(live, /setInterval/);
    assert.doesNotMatch(live, /setTimeout/);
    assert.doesNotMatch(live, /useEffect/);
    const pages = read('pages/FleetPages.tsx');
    assert.match(pages, /FastagDashboardPage/);
    const routesSource = read('routes.tsx');
    assert.match(routesSource, /fleet\/fastag/);
    assert.equal(fs.existsSync(path.join(here, 'hooks/useFastagData.ts')), true);
    assert.equal(fs.existsSync(path.join(here, 'services/storage.ts')), true);
  });

  it('FASTAG does not participate in Fleet cache or refresh of other tabs', () => {
    const cache = read('services/fleetSessionCache.ts');
    assert.match(cache, /FASTAG/);
    assert.doesNotMatch(cache, /fastag:/);
    const emi = read('hooks/useEmiData.ts');
    const maintenance = read('hooks/useMaintenanceData.ts');
    const permits = read('hooks/useDocumentsData.ts');
    const analytics = read('hooks/useAnalyticsData.ts');
    for (const source of [emi, maintenance, permits, analytics]) {
      assert.equal(source.includes('fastag'), false);
      assert.equal(source.includes('useFastagData'), false);
    }
  });

  it('does not create cache keys for deferred modules in the session cache helper', () => {
    const source = read('services/fleetSessionCache.ts');
    assert.match(source, /Do not add Dashboard/);
    assert.doesNotMatch(source, /dash:/);
    assert.doesNotMatch(source, /reports:/);
    assert.doesNotMatch(source, /expenses:/);
  });

  it('resolves the default tab without a second navigate when ?tab= is already valid', () => {
    const source = read('pages/FleetPages.tsx');
    assert.match(source, /if \(isVisibleFleetTab\(requestedTab\)\) return/);
    assert.match(source, /DEFAULT_FLEET_TAB/);
    assert.doesNotMatch(source, /tab=\$\{activeTab\}/);
  });

  it('Maintenance Entry does not load Operations fuel-expenses until a vehicle is selected', () => {
    const entry = read('pages/MaintenanceEntryPage.tsx');
    const form = read('components/maintenance/MaintenanceForm.tsx');
    const guard = read('hooks/useFleetFuelKmGuard.ts');
    assert.match(entry, /useFleetFuelKmGuard/);
    assert.doesNotMatch(entry, /useFuelKMValidator/);
    assert.doesNotMatch(entry, /useFuelExpenses/);
    assert.doesNotMatch(form, /useFuelKMValidator/);
    assert.doesNotMatch(form, /useFuelExpenses/);
    assert.match(guard, /if \(!vehicle\)/);
    assert.match(guard, /fuelExpenseService/);
  });

  it('AppRoutes lazy-loads FleetPages so other modules do not evaluate Fleet tabs', () => {
    const appRoutes = fs.readFileSync(
      path.join(here, '../../routes/AppRoutes.tsx'),
      'utf8'
    );
    assert.match(appRoutes, /React\.lazy\(\(\) => import\("\.\.\/modules\/fleet-operations\/pages\/FleetPages"\)\)/);
    assert.match(appRoutes, /fleetFallback/);
  });
});
