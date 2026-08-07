import { tsImport } from 'tsx/esm/api';

tsImport('./server.ts', import.meta.url).catch((error) => {
  console.error('Failed to start the Connektly server:', error);
  process.exitCode = 1;
});
