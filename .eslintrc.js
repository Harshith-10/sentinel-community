export const parser = '@typescript-eslint/parser';
export const plugins = ['@typescript-eslint'];
export const rules = {
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/explicit-function-return-type': 'warn',
    '@typescript-eslint/no-explicit-any': 'warn'
};
export const env = {
    node: true,
    es6: true
};
