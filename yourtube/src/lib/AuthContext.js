import { onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import { useRef, useState } from "react";
import { createContext } from "react";
import { provider, auth } from "./firebase";
import axiosInstance from "./axiosinstance";
import { useEffect, useContext } from "react";
import { toast } from "sonner";

const UserContext = createContext();

const getDefaultTheme = () => {
  const istTime = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" })
  );
  const hour = istTime.getHours();
  return hour >= 10 && hour < 12 ? "light" : "dark";
};

const applyTheme = (theme) => {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.classList.toggle("light", theme === "light");
  document.documentElement.dataset.theme = theme;
  localStorage.setItem("themePreference", theme);
};

const getDeviceId = () => {
  const storageKey = "yourtube-device-id";
  let deviceId = localStorage.getItem(storageKey);
  if (!deviceId) {
    deviceId =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    localStorage.setItem(storageKey, deviceId);
  }
  return deviceId;
};

const getLoginContext = () => ({
  deviceId: getDeviceId(),
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  region: navigator.language,
  city: localStorage.getItem("yourtube-login-city") || "",
  state: localStorage.getItem("yourtube-login-state") || "",
  userAgent: navigator.userAgent,
});

const createLocalUser = (firebaseuser) => {
  const cleanUid = (firebaseuser?.uid || firebaseuser?.email || "local-user")
    .replace(/[^a-fA-F0-9]/g, "")
    .padEnd(24, "0")
    .slice(0, 24);

  return {
    _id: cleanUid,
    email: firebaseuser.email,
    name: firebaseuser.displayName,
    image: firebaseuser.photoURL || "https://github.com/shadcn.png",
    premiumPlan: "free",
    themePreference: getDefaultTheme(),
    downloadCount: 0,
    downloadLimitResetAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    isLocalAccount: true,
  };
};

export const UserProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [theme, setTheme] = useState("dark");
  const [isSigningIn, setIsSigningIn] = useState(false);
  const popupInProgressRef = useRef(false);
  const syncedFirebaseUidRef = useRef(null);

  const login = (userdata) => {
    const userTheme = userdata?.themePreference || getDefaultTheme();
    const nextUser = { ...userdata, themePreference: userTheme };
    setUser(nextUser);
    setTheme(userTheme);
    applyTheme(userTheme);
    localStorage.setItem("user", JSON.stringify(nextUser));
  };
  const logout = async () => {
    setUser(null);
    syncedFirebaseUidRef.current = null;
    localStorage.removeItem("user");
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Error during sign out:", error);
    }
  };

  const verifyOtpChallenge = async (challenge) => {
    if (challenge.devOtp) {
      toast.info(`Development OTP: ${challenge.devOtp}`);
    }

    const otp = window.prompt(
      "We noticed a new city, state, or device. Enter the OTP sent to your registered email or mobile."
    );

    if (!otp) {
      toast.error("OTP verification is required for this login.");
      return;
    }

    const response = await axiosInstance.post(`/user/login/${challenge.userId}/otp`, {
      otp,
    });
    login(response.data.result);
    toast.success("Login verified.");
  };

  const updateThemePreference = async (nextTheme) => {
    setTheme(nextTheme);
    applyTheme(nextTheme);

    if (!user) {
      localStorage.setItem("themePreference", nextTheme);
      return;
    }

    if (user.isLocalAccount) {
      login({ ...user, themePreference: nextTheme });
      return;
    }

    try {
      const response = await axiosInstance.patch(`/user/theme/${user._id}`, {
        themePreference: nextTheme,
      });
      login(response.data);
      toast.success(`${nextTheme === "light" ? "Light" : "Dark"} theme saved.`);
    } catch (error) {
      console.error(error);
      toast.error("Theme changed locally, but could not be saved to your profile.");
    }
  };

  const handlegooglesignin = async () => {
    if (popupInProgressRef.current) return;

    popupInProgressRef.current = true;
    setIsSigningIn(true);
    try {
      const result = await signInWithPopup(auth, provider);
      const firebaseuser = result.user;
      await syncFirebaseUser(firebaseuser);
    } catch (error) {
      console.error(error);
      if (auth.currentUser) {
        login(createLocalUser(auth.currentUser));
        toast.warning(
          "Signed in locally. Backend account sync will work after the database connects."
        );
        return;
      }

      toast.error("Could not sign in. Please try again.");
    } finally {
      popupInProgressRef.current = false;
      setIsSigningIn(false);
    }
  };

  const syncFirebaseUser = async (firebaseuser) => {
    if (!firebaseuser?.uid || syncedFirebaseUidRef.current === firebaseuser.uid) {
      return;
    }

    syncedFirebaseUidRef.current = firebaseuser.uid;
    try {
      const response = await axiosInstance.post("/user/login", {
        email: firebaseuser.email,
        name: firebaseuser.displayName,
        image: firebaseuser.photoURL || "https://github.com/shadcn.png",
        loginContext: getLoginContext(),
      });
      if (response.data.requiresOtp) {
        await verifyOtpChallenge(response.data);
        return;
      }
      login(response.data.result);
    } catch (error) {
      console.error(error);
      login(createLocalUser(firebaseuser));
    }
  };
  useEffect(() => {
    const savedUser = localStorage.getItem("user");
    if (savedUser) {
      try {
        const parsedUser = JSON.parse(savedUser);
        if (!parsedUser?.isLocalAccount) {
          login(parsedUser);
        }
      } catch (error) {
        localStorage.removeItem("user");
      }
    }

    const unsubcribe = onAuthStateChanged(auth, async (firebaseuser) => {
      if (firebaseuser) {
        // The popup handler owns its sign-in. Running another login while the
        // popup operation is completing can leave Firebase with stale popup state.
        if (!popupInProgressRef.current) {
          await syncFirebaseUser(firebaseuser);
        }
      } else {
        syncedFirebaseUidRef.current = null;
      }
    });
    return () => unsubcribe();
  }, []);

  useEffect(() => {
    const savedTheme = user?.themePreference || localStorage.getItem("themePreference");
    const initialTheme = savedTheme || getDefaultTheme();
    setTheme(initialTheme);
    applyTheme(initialTheme);
  }, [user?.themePreference]);

  return (
    <UserContext.Provider
      value={{ user, login, logout, handlegooglesignin, isSigningIn, theme, updateThemePreference }}
    >
      {children}
    </UserContext.Provider>
  );
};

export const useUser = () => useContext(UserContext);
