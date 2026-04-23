import axios from "axios";

let onUnauthorized = null;

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "/api",
  withCredentials: true,
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const shouldHandle =
      error?.response?.status === 401 &&
      !error?.config?.skipAuthHandling &&
      typeof onUnauthorized === "function";

    if (shouldHandle) {
      onUnauthorized(error);
    }

    return Promise.reject(error);
  }
);

export function setUnauthorizedHandler(handler) {
  onUnauthorized = handler;
}

export default api;
