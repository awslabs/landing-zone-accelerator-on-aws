import path from 'path';

export const CONFIG_DIR = path.resolve(__dirname, '../../accelerator/test/configs');
export const REPLACEMENT_CONFIG = path.join(CONFIG_DIR, 'replacements');
export const SNAPSHOT_CONFIG = path.join(CONFIG_DIR, 'snapshot-only');
export const ALL_ENABLED_CONFIG = path.join(CONFIG_DIR, 'all-enabled');
