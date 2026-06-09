import { Search } from 'lucide-react';

type Props = {
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
};

export function SearchBox({ value, placeholder, onChange }: Props) {
  return (
    <label className="search-box">
      <Search size={16} />
      <input value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}
