import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Testes de integração compartilham um banco: rodar arquivos em série evita interferência.
    fileParallelism: false,
  },
});
