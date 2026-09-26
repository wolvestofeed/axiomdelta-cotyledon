// `server-only` is a Next.js runtime marker that throws if imported
// from the client bundle. Under vitest we're not in a Next bundler;
// alias it to this empty stub so server-side modules can be imported
// by unit tests.
export {};
