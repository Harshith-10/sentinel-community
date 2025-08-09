import { promises as fs } from 'fs';
import path from 'path';
import { LanguageConfig, LanguageInfo } from './types';

class LanguageManager {
  private languages: Map<string, LanguageConfig> = new Map();
  private readonly configDir: string;

  constructor() {
    this.configDir = path.join(__dirname, '..', 'config', 'languages');
  }

  async loadLanguages(): Promise<void> {
    try {
      const files = await fs.readdir(this.configDir);
      const jsonFiles = files.filter((file: string) => file.endsWith('.json'));

      for (const file of jsonFiles) {
        const filePath = path.join(this.configDir, file);
        const content = await fs.readFile(filePath, 'utf8');
        const config: LanguageConfig = JSON.parse(content) as LanguageConfig;
        
        // Validate required fields
        if (!this.validateLanguageConfig(config)) {
          console.error(`Invalid language config in ${file}`);
          continue;
        }

        this.languages.set(config.name, config);
        console.log(`Loaded language: ${config.displayName} (${config.name})`);
      }

      console.log(`Loaded ${this.languages.size} languages`);
    } catch (error) {
      console.error('Error loading languages:', error);
      throw error;
    }
  }

  private validateLanguageConfig(config: any): config is LanguageConfig {
  const required = ['name', 'displayName', 'extension', 'command', 'args', 'timeout'];
    return required.every(field => config && typeof config === 'object' && field in config);
  }

  getLanguage(name: string): LanguageConfig | undefined {
    return this.languages.get(name);
  }

  getSupportedLanguages(): string[] {
    return Array.from(this.languages.keys());
  }

  getAllLanguages(): LanguageConfig[] {
    return Array.from(this.languages.values());
  }

  isSupported(language: string): boolean {
    return this.languages.has(language);
  }

  getLanguageInfo(): LanguageInfo[] {
    return this.getAllLanguages().map(lang => ({
      name: lang.name,
      displayName: lang.displayName
    }));
  }
}

export default new LanguageManager();
