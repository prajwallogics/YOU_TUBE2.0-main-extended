import axios from "axios";
const axiosInstance = axios.create({
  baseURL: process.env.NEXT_PUBLIC_BACKEND_URL || process.env.BACKEND_URL,
 
});
export default axiosInstance;
