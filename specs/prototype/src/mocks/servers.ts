export type ServerStatus = 'running' | 'stopped' | 'starting' | 'stopping' | 'restarting';

export interface Server {
  id: string;
  name: string;
  provider: string;
  status: ServerStatus;
  cpu: string;
  ram: string;
  disk: string;
  ip: string;
  location: string;
  os: string;
}

export const mockServers: Server[] = [
  {
    id: 'srv-01',
    name: 'web-prod-01',
    provider: 'Hetzner',
    status: 'running',
    cpu: '4 vCPU (AMD EPYC)',
    ram: '16 GB',
    disk: '160 GB NVMe',
    ip: '49.12.34.56',
    location: 'Nuremberg, DE',
    os: 'Ubuntu 24.04 LTS',
  },
  {
    id: 'srv-02',
    name: 'web-prod-02',
    provider: 'Hetzner',
    status: 'running',
    cpu: '4 vCPU (AMD EPYC)',
    ram: '16 GB',
    disk: '160 GB NVMe',
    ip: '49.12.34.78',
    location: 'Falkenstein, DE',
    os: 'Ubuntu 24.04 LTS',
  },
  {
    id: 'srv-03',
    name: 'db-primary',
    provider: 'Hetzner',
    status: 'running',
    cpu: '8 vCPU (Intel Xeon)',
    ram: '32 GB',
    disk: '320 GB NVMe',
    ip: '78.46.12.34',
    location: 'Nuremberg, DE',
    os: 'Debian 12',
  },
  {
    id: 'srv-04',
    name: 'db-replica',
    provider: 'Hetzner',
    status: 'stopped',
    cpu: '8 vCPU (Intel Xeon)',
    ram: '32 GB',
    disk: '320 GB NVMe',
    ip: '78.46.12.56',
    location: 'Helsinki, FI',
    os: 'Debian 12',
  },
  {
    id: 'srv-05',
    name: 'cache-node',
    provider: 'Hetzner',
    status: 'running',
    cpu: '2 vCPU (AMD EPYC)',
    ram: '8 GB',
    disk: '80 GB NVMe',
    ip: '116.203.45.67',
    location: 'Nuremberg, DE',
    os: 'Ubuntu 24.04 LTS',
  },
  {
    id: 'srv-06',
    name: 'dev-staging',
    provider: 'Hetzner',
    status: 'stopped',
    cpu: '2 vCPU (AMD EPYC)',
    ram: '8 GB',
    disk: '80 GB NVMe',
    ip: '116.203.45.89',
    location: 'Falkenstein, DE',
    os: 'Ubuntu 24.04 LTS',
  },
];