'use client';

import { useState, useEffect } from 'react';
import { useProviderHealth } from '@/lib/api/hooks/use-provider-health';
import { useLatency } from '@/lib/api/hooks/use-latency';
import { useErrors } from '@/lib/api/hooks/use-errors';
import { StatusCards } from '@/components/providers/status-cards';
import { LatencyChart } from '@/components/providers/latency-chart';
import { ErrorRateChart } from '@/components/providers/error-rate-chart';
import { TimeRangeSelector } from '@/components/providers/time-range-selector';
import { AutoRefreshSelector } from '@/components/providers/auto-refresh-selector';
import {
  CascadeToggle,
  readCascadePreference,
} from '@/components/providers/cascade-toggle';

export default function ProvidersPage() {
  const [timeRange, setTimeRange] = useState('24h');
  const [refreshInterval, setRefreshInterval] = useState(0);
  const [showCascade, setShowCascade] = useState(true);

  // Initialize cascade preference from localStorage on mount
  useEffect(() => {
    setShowCascade(readCascadePreference());
  }, []);

  const handleCascadeToggle = (show: boolean) => {
    setShowCascade(show);
  };

  const health = useProviderHealth(refreshInterval);
  const latency = useLatency(timeRange, refreshInterval);
  const errors = useErrors(timeRange, refreshInterval);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Provider Health</h1>
        <div className="flex items-center gap-4">
          <CascadeToggle value={showCascade} onChange={handleCascadeToggle} />
          <TimeRangeSelector value={timeRange} onChange={setTimeRange} />
          <AutoRefreshSelector
            value={refreshInterval}
            onChange={setRefreshInterval}
          />
        </div>
      </div>

      <StatusCards
        data={health.data}
        isLoading={health.isLoading}
        isError={health.isError}
        error={health.error}
        showCascade={showCascade}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
        <LatencyChart data={latency.data} isLoading={latency.isLoading} />
        <ErrorRateChart data={errors.data} isLoading={errors.isLoading} />
      </div>
    </div>
  );
}
