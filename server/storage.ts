import type { IProvider } from './providers/types';
import { MockProvider } from './providers/mock';
import { SimulationProvider } from './providers/simulation';
import { RemoteProvider } from './providers/remote';

export interface IStorage {
  provider: IProvider;
}

const providerType = process.env.PROVIDER || 'MOCK';

let provider: IProvider;
if (providerType === 'SIMULATION') {
  provider = new SimulationProvider();
} else if (providerType === 'REMOTE') {
  provider = new RemoteProvider();
} else {
  provider = new MockProvider();
}

export class MemStorage implements IStorage {
  public provider: IProvider;

  constructor() {
    this.provider = provider;
  }
}

export const storage = new MemStorage();
