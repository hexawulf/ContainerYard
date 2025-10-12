import type { IProvider } from './providers/types';
import { MockProvider } from './providers/mock';
import { SimulationProvider } from './providers/simulation';

export interface IStorage {
  provider: IProvider;
}

const providerType = process.env.PROVIDER || 'MOCK';

let provider: IProvider;
if (providerType === 'SIMULATION') {
  provider = new SimulationProvider();
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
