// Stubs for the Max runtime globals that modules touch at *import* time — e.g.
// utils.ts runs `new Dict(...)` at module load. Registered via vitest
// `setupFiles`, which runs before any test module is imported. (Inline
// vi.stubGlobal in a test file runs too late: ESM hoists the `import` above it.)
const g = globalThis as any

g.Dict = function () {
  const store: Record<string, any> = {}
  return {
    get: (k: string) => store[k],
    set: (k: string, v: any) => {
      store[k] = v
    },
    getkeys: () => Object.keys(store),
  }
}
g.outlet = () => {}
g.post = () => {}
