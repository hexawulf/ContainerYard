// server/src/lib/parseDockerStats.ts
export function parseContainerInstant(raw: any) {
  // CPU %
  const cpuDelta =
    (raw?.cpu_stats?.cpu_usage?.total_usage ?? 0) -
    (raw?.precpu_stats?.cpu_usage?.total_usage ?? 0);
  const sysDelta =
    (raw?.cpu_stats?.system_cpu_usage ?? 0) -
    (raw?.precpu_stats?.system_cpu_usage ?? 0);
  const cores =
    raw?.cpu_stats?.online_cpus ??
    raw?.cpu_stats?.cpu_usage?.percpu_usage?.length ??
    1;
  const cpuPct = sysDelta > 0 && cpuDelta > 0 ? (cpuDelta / sysDelta) * cores * 100 : 0;

  // Memory (cgroup v1/v2)
  // Prefer working set (usage - cache). Fallback to usage or rss.
  const usage = raw?.memory_stats?.usage ?? 0;
  const cache =
    raw?.memory_stats?.stats?.cache ??
    raw?.memory_stats?.stats?.inactive_file ??
    0; // cgroup v2 approx
  const rss =
    raw?.memory_stats?.stats?.rss ??
    raw?.memory_stats?.stats?.total_rss ??
    0;

  let memBytes = usage;
  if (usage && cache && usage >= cache) memBytes = usage - cache;
  if (!memBytes && rss) memBytes = rss;

  const memLimit = raw?.memory_stats?.limit ?? 0;
  const memPct = memLimit > 0 ? (memBytes / memLimit) * 100 : 0;

  // Network (sum all ifaces)
  let netRx = 0, netTx = 0;
  const nets = raw?.networks ?? raw?.network ?? {};
  for (const k of Object.keys(nets)) {
    netRx += nets[k]?.rx_bytes ?? 0;
    netTx += nets[k]?.tx_bytes ?? 0;
  }

  // Block I/O
  let blkRead = 0, blkWrite = 0;
  const blk = raw?.blkio_stats?.io_service_bytes_recursive ?? [];
  for (const e of blk) {
    const op = String(e?.op ?? e?.Op ?? '').toLowerCase();
    if (op.includes('read')) blkRead += e?.value ?? 0;
    if (op.includes('write')) blkWrite += e?.value ?? 0;
  }

  return {
    cpuPct,
    memBytes,
    memPct,
    netRx,
    netTx,
    blkRead,
    blkWrite,
    ts: raw?.read ?? new Date().toISOString(),
  };
}
