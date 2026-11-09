export function suggestedAddress(data: unknown) {
  const address = (data as { address?: Record<string, unknown> })?.address;
  if (!address || address.country_code !== "in") return null;
  const text = (...keys: string[]) => {
    for (const key of keys)
      if (typeof address[key] === "string" && address[key])
        return (address[key] as string).trim().slice(0, 120);
    return "";
  };
  const postcode = text("postcode");
  return {
    locality: text("suburb", "neighbourhood", "village", "town", "city"),
    district: text("state_district", "county", "city_district", "city", "town"),
    state: text("state"),
    pincode: /^\d{6}$/.test(postcode) ? postcode : "",
  };
}
