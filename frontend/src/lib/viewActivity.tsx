import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

const ViewActivityContext = createContext<boolean>(true);

export function ViewActivityProvider({
  active,
  children,
}: {
  active: boolean;
  children: React.ReactNode;
}) {
  const value = useMemo(() => active, [active]);
  return (
    <ViewActivityContext.Provider value={value}>
      {children}
    </ViewActivityContext.Provider>
  );
}

export function useViewActivity(): boolean {
  return useContext(ViewActivityContext);
}

export function useViewVisibility(): boolean {
  const active = useViewActivity();
  const [documentVisible, setDocumentVisible] = useState<boolean>(() => {
    if (typeof document === "undefined") return true;
    return document.visibilityState === "visible";
  });

  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    const handleVisibilityChange = () => {
      setDocumentVisible(document.visibilityState === "visible");
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  return active && documentVisible;
}
