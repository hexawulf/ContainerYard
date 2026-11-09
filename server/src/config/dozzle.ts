/**
 * Dozzle deep links for CADVISOR_ONLY hosts.
 *
 * cAdvisor identifies containers by cgroup path (`/docker/<64hex>` on cgroup v1,
 * `/system.slice/docker-<64hex>.scope` on cgroup v2). Dozzle (v8+, incl. the
 * multi-host hub with remote agents) routes containers as `/container/<12-char id>`
 * without a hash fragment, so the path must be reduced to the short Docker ID.
 */
const DOCKER_ID = /([0-9a-f]{64}|[0-9a-f]{12})/i;

export function dockerIdFromCadvisorPath(containerPath: string): string | null {
  const decoded = decodeURIComponent(containerPath);
  const match = decoded.match(/docker[-/]([0-9a-f]{12,64})(?:\.scope)?\/?$/i) ?? decoded.match(DOCKER_ID);
  return match ? match[1].slice(0, 12).toLowerCase() : null;
}

export function dozzleContainerLink(dozzleUrl: string, containerPath: string): string {
  const base = dozzleUrl.replace(/\/+$/, "");
  const id = dockerIdFromCadvisorPath(containerPath);
  return id ? `${base}/container/${id}` : base;
}
