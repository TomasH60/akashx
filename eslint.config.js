import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default [
  { ignores: ['dist/**', 'coverage/**', 'website/dist/**', 'website/.astro/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
];
