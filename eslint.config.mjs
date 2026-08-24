import nextConfig from 'eslint-config-next/core-web-vitals';

const eslintConfig = [
  { ignores: ['.next/**', 'node_modules/**', 'renderer/node_modules/**', 'convex/_generated/**'] },
  ...nextConfig,
  {
    rules: {
      // These rules are intentionally relaxed for the existing application
      // while the presentation layer is being migrated incrementally.
      'react/no-unescaped-entities': 'off',
      'react-hooks/set-state-in-effect': 'off',
      'react/jsx-no-comment-textnodes': 'off',
    },
  },
];

export default eslintConfig;
