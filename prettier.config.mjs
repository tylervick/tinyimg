/**
 * @see https://prettier.io/docs/configuration
 * @type {import("prettier").Config}
 */
const config = {
  tabWidth: 2,
  useTabs: false,
  semi: true,
  singleQuote: true,
  plugins: [
    'prettier-plugin-organize-imports', // must be last
  ],
};

export default config;
