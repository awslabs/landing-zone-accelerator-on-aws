import path from 'path';

const CONFIG_DIR = process.env.LZA_TEST_CONFIG_DIR
  ? process.env.LZA_TEST_CONFIG_DIR
  : path.resolve(__dirname, '../../accelerator/test/configs');

export { CONFIG_DIR };

export const REPLACEMENT_CONFIG = path.join(CONFIG_DIR, 'replacements');
export const SNAPSHOT_CONFIG = path.join(CONFIG_DIR, 'snapshot-only');
export const ALL_ENABLED_CONFIG = path.join(CONFIG_DIR, 'all-enabled');
