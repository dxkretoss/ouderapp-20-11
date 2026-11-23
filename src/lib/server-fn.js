// Clean client-safe replacement for @tanstack/react-start server functions in pure React + Vite SPA
export function createServerFn(options = {}) {
  let fnValidator = null;
  let fnHandler = null;
  const builder = {
    inputValidator(v) {
      fnValidator = v;
      return builder;
    },
    validator(v) {
      fnValidator = v;
      return builder;
    },
    handler(h) {
      fnHandler = h;
      const fn = async (args) => {
        let data = args && args.data !== undefined ? args.data : args;
        if (fnValidator) {
          try {
            data = fnValidator(data);
          } catch (e) {
            console.warn("Input validation warning:", e);
          }
        }
        return await h({ data });
      };
      return fn;
    },
  };
  return builder;
}

export function useServerFn(serverFn) {
  return serverFn;
}
