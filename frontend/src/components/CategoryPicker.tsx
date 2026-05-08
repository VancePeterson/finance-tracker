import { useQuery } from "@tanstack/react-query";
import { api } from "../api";

interface Props {
  value: number | null | undefined;
  onChange: (categoryId: number | null) => void;
}

export default function CategoryPicker({ value, onChange }: Props) {
  const { data: categories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: () => api.categories.list(),
  });
  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
    >
      <option value="">— uncategorized —</option>
      {categories.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </select>
  );
}
