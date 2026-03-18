import { betterAuth } from 'better-auth';
import { dash } from '@better-auth/infra';

export const auth = betterAuth({
  plugins: [
    dash(),
  ],
});
