import { loadConfig, onConfigChange, saveConfig } from '../shared/config/storage';
import type { Config } from '../shared/types';

type Listener = (config: Config) => void;

/** Keeps the configuration of the settings page and informs the views about changes. */
class Store {
  private current: Config | null = null;
  private readonly listeners = new Set<Listener>();

  get config(): Config {
    if (this.current === null) throw new Error('Store is not loaded');
    return this.current;
  }

  async load(): Promise<Config> {
    this.current = await loadConfig();
    // Changes from the popup, the shortcut, or a different device.
    onConfigChange((config) => {
      if (config.updatedAt === this.current?.updatedAt) return;
      this.current = config;
      this.emit();
    });
    return this.current;
  }

  async save(next: Config): Promise<void> {
    this.current = await saveConfig(next);
    this.emit();
  }

  update(change: (config: Config) => Config): Promise<void> {
    return this.save(change(this.config));
  }

  subscribe(listener: Listener): void {
    this.listeners.add(listener);
  }

  private emit(): void {
    for (const listener of this.listeners) listener(this.config);
  }
}

export const store = new Store();
