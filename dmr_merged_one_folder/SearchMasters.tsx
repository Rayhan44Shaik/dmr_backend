import { Search } from "lucide-react";

type SearchMastersProps = {
  search: string;
  onSearchChange: (value: string) => void;
};

function SearchMasters({
  search,
  onSearchChange,
}: SearchMastersProps) {

  return (

    <div className="bg-white rounded-2xl shadow border p-6">

      <h2 className="text-xl font-bold mb-5">
        Search Masters
      </h2>

      <div className="relative">

        <Search
          size={20}
          className="absolute left-4 top-3.5 text-gray-400"
        />

        <input
          type="text"
          value={search}
          onChange={(e)=>onSearchChange(e.target.value)}
          placeholder="Search Shops, Farms, Vehicles, Employees..."
          className="w-full border rounded-xl pl-12 pr-4 py-3 focus:outline-none focus:ring-2 focus:ring-green-700"
        />

      </div>

    </div>

  );

}

export default SearchMasters;