import { useState, useMemo, useRef, useEffect } from "react";

export function useShopSearch(
  shops: string[],
  selectedShop: string,
  onShopChange: (value: string) => void
) {
  const [query, setQuery] = useState(selectedShop || "");
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setQuery(selectedShop || "");
  }, [selectedShop]);

  const filteredShops = useMemo(() => {
    if (!query.trim()) return shops;
    return shops.filter((shop) =>
      shop.toLowerCase().startsWith(query.toLowerCase())
    );
  }, [shops, query]);

  const handleSelect = (shop: string) => {
    setQuery(shop);
    onShopChange(shop);
    setIsOpen(false);
  };

  const handleInputChange = (value: string) => {
    setQuery(value);
    setIsOpen(true);
    if (selectedShop && value !== selectedShop) {
      onShopChange("");
    }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return {
    query,
    isOpen,
    setIsOpen,
    wrapperRef,
    filteredShops,
    handleSelect,
    handleInputChange,
    setQuery, // <-- required for "Clear All"
  };
}