import React, { useState, useEffect, useCallback } from 'react';
import { Toaster, toast } from 'react-hot-toast';
import { api } from '../utils/api';
import { RefreshCw, Trash2, Database, Table as TableIcon } from 'lucide-react';
import { AdvancedPagination } from '../components/ui/Pagination';
import { TableEmptyState } from '../components/ui/EmptyState';

// --- Interfaces ---

interface SystemHealth {
  status: string;
  database: string;
  postgres_version?: string;
  total_users?: number;
  tables?: string;
  timestamp: string;
  error?: string;
}

interface TableSchema {
  column: string;
  type: string;
  nullable: string;
}

interface DatabaseInfo {
  schema: Record<string, TableSchema[]>;
  table_counts: Record<string, number>;
  database_name: string;
}

// Generic Row Type since we don't know columns ahead of time
type TableRow = Record<string, unknown>;

const DatabasePOC: React.FC = () => {
  // State
  const [systemHealth, setSystemHealth] = useState<SystemHealth | null>(null);
  const [dbInfo, setDbInfo] = useState<DatabaseInfo | null>(null);
  
  // Table Explorer State
  const [availableTables, setAvailableTables] = useState<string[]>([]);
  const [selectedTableName, setSelectedTableName] = useState<string>('');
  const [tableData, setTableData] = useState<TableRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [tableLoading, setTableLoading] = useState<boolean>(false);

  // Pagination State
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [rowsPerPage, setRowsPerPage] = useState<number>(10);

  // --- API Calls ---

  const fetchHealth = useCallback(async () => {
    try {
      const response = await api.get<SystemHealth>('/health');
      setSystemHealth(response.data);
    } catch {
      setSystemHealth(null);
    }
  }, []);

  const fetchDbInfo = useCallback(async () => {
    try {
      const response = await api.get<DatabaseInfo>('/database/info');
      setDbInfo(response.data);
      
      // Extract table names from schema keys
      const tables = Object.keys(response.data.schema);
      setAvailableTables(tables);
      
      // Select first table by default if none selected
      if (!selectedTableName && tables.length > 0) {
        setSelectedTableName(tables[0]);
      }
    } catch {
      toast.error("Failed to load database structure");
    }
  }, [selectedTableName]);

  const fetchTableData = useCallback(async (tableName: string) => {
    if (!tableName) return;
    
    setTableLoading(true);
    try {
      const response = await api.get<TableRow[]>(`/database/table/${tableName}`);
      setTableData(response.data);
    } catch {
      toast.error(`Failed to load data for ${tableName}`);
    } finally {
      setTableLoading(false);
    }
  }, []);

  const deleteRow = async (id: string | number) => {
    if (!window.confirm(`Are you sure you want to delete row ID ${id}? This may cascade delete related data.`)) return;

    try {
      await api.delete(`/database/table/${selectedTableName}/${id}`);
      toast.success('Row deleted successfully');
      // Refresh table data
      fetchTableData(selectedTableName);
      // Refresh generic counts
      fetchDbInfo(); 
    } catch {
      toast.error('Failed to delete row. Check console.');
    }
  };

  // --- Effects ---

  // Initial Load
  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await Promise.all([fetchHealth(), fetchDbInfo()]);
      setLoading(false);
    };
    init();
  }, [fetchHealth, fetchDbInfo]);

  // When selected table changes, fetch its data and RESET pagination
  useEffect(() => {
    if (selectedTableName) {
      fetchTableData(selectedTableName);
      setCurrentPage(1); // Reset to first page
    }
  }, [selectedTableName, fetchTableData]);


  // --- Helper to identify ID column ---
  const getRowId = (row: TableRow): string | number => {
    // Try common ID names
    const preferredKeys = ["id", "credential_id", "user_id", "project_id"];
    for (const key of preferredKeys) {
      const value = row[key];
      if (typeof value === "string" || typeof value === "number") {
        return value;
      }
    }

    // Fallback: take the first string/number value
    const fallback = Object.values(row).find(
      (value) => typeof value === "string" || typeof value === "number"
    );
    return fallback ?? "";
  };

  // --- Pagination Logic ---
  const indexOfLastRow = currentPage * rowsPerPage;
  const indexOfFirstRow = indexOfLastRow - rowsPerPage;
  const currentRows = tableData.slice(indexOfFirstRow, indexOfLastRow);
  const totalPages = Math.ceil(tableData.length / rowsPerPage);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Toaster position="top-right" />

      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                <Database className="w-6 h-6 text-blue-600" />
                Database Explorer
              </h1>
              <p className="text-sm text-gray-500 mt-1">
                Connected to: <span className="font-mono font-medium text-blue-600">{dbInfo?.database_name}</span>
              </p>
            </div>
            <div className="flex items-center space-x-3">
               <div className={`flex items-center space-x-2 px-3 py-1 rounded-full text-sm ${
                 systemHealth?.status === 'healthy' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
               }`}>
                 <div className={`w-2 h-2 rounded-full ${systemHealth?.status === 'healthy' ? 'bg-green-500' : 'bg-red-500'}`}></div>
                 <span>{systemHealth?.postgres_version?.split(' ')[0] || 'Unknown'}</span>
               </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row gap-6">
          
          {/* LEFT SIDEBAR: Table List */}
          <div className="w-full md:w-64 flex-shrink-0">
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <div className="p-4 bg-gray-50 border-b border-gray-200 flex items-center gap-2">
                <TableIcon className="w-4 h-4 text-gray-500" />
                <h3 className="font-semibold text-gray-700">Tables</h3>
              </div>
              <ul className="divide-y divide-gray-100 max-h-[600px] overflow-y-auto">
                {availableTables.map((table) => (
                  <li key={table}>
                    <button
                      onClick={() => setSelectedTableName(table)}
                      className={`w-full text-left px-4 py-3 text-sm flex justify-between items-center hover:bg-gray-50 transition-colors ${
                        selectedTableName === table 
                          ? 'bg-blue-50 text-blue-700 font-medium border-l-4 border-blue-600' 
                          : 'text-gray-600 border-l-4 border-transparent'
                      }`}
                    >
                      <span className="truncate">{table}</span>
                      <span className="bg-gray-100 text-gray-500 py-0.5 px-2 rounded-full text-xs ml-2">
                        {dbInfo?.table_counts[table] || 0}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            {/* Schema Info Card */}
            {selectedTableName && dbInfo?.schema[selectedTableName] && (
              <div className="mt-6 bg-white rounded-lg shadow p-4">
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Schema: {selectedTableName}</h4>
                <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2">
                  {dbInfo.schema[selectedTableName].map((col) => (
                    <div key={col.column} className="flex justify-between text-xs">
                      <span className="font-mono text-gray-700 truncate mr-2" title={col.column}>{col.column}</span>
                      <span className="text-gray-400 flex-shrink-0">{col.type}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* MAIN CONTENT: Data Table */}
          <div className="flex-1 overflow-hidden bg-white rounded-lg shadow flex flex-col min-h-[600px]">
            {/* Table Toolbar */}
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
              <h2 className="text-lg font-medium text-gray-900">
                Data: <span className="font-mono text-blue-600">{selectedTableName}</span>
              </h2>
              <div className="flex items-center space-x-4">
                <span className="text-sm text-gray-500">
                   Total: {tableData.length} rows
                </span>
                <button 
                  onClick={() => fetchTableData(selectedTableName)}
                  className="text-sm text-gray-600 hover:text-blue-600 flex items-center gap-1 bg-white border border-gray-300 px-3 py-1.5 rounded-md shadow-sm transition-colors"
                >
                  <RefreshCw className="w-4 h-4" />
                  Refresh
                </button>
              </div>
            </div>

            {/* Table Area */}
            <div className="flex-1 overflow-auto">
              {tableLoading ? (
                <div className="h-full flex flex-col items-center justify-center text-gray-400">
                   <RefreshCw className="w-8 h-8 animate-spin mb-2 text-blue-500" />
                   <p>Loading data...</p>
                </div>
              ) : tableData.length === 0 ? (
                <TableEmptyState
                  emoji="∅"
                  title="Table is empty"
                  variant="light"
                  isTableFooter={false}
                />
              ) : (
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50 sticky top-0 shadow-sm z-10">
                    <tr>
                      {/* Dynamically render headers based on first row keys */}
                      {Object.keys(tableData[0]).map((key) => (
                        <th key={key} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap bg-gray-50">
                          {key}
                        </th>
                      ))}
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50 sticky right-0">
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {currentRows.map((row, idx) => (
                      <tr key={idx} className="hover:bg-blue-50 transition-colors">
                        {Object.entries(row).map(([key, value]) => (
                          <td key={key} className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 font-mono max-w-xs overflow-hidden text-ellipsis" title={String(value)}>
                            {value === null ? <span className="text-gray-300 italic">null</span> : String(value)}
                          </td>
                        ))}
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium sticky right-0 bg-white/50 backdrop-blur-sm group-hover:bg-blue-50/50">
                          <button
                            onClick={() => deleteRow(getRowId(row))}
                            className="text-red-600 hover:text-red-900 bg-red-50 hover:bg-red-100 p-2 rounded-md transition-colors"
                            title="Delete Row"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Pagination Footer */}
            {!tableLoading && tableData.length > 0 && (
              <AdvancedPagination
                currentPage={currentPage}
                totalPages={totalPages}
                totalItems={tableData.length}
                itemsPerPage={rowsPerPage}
                onPageChange={setCurrentPage}
                onItemsPerPageChange={(newItemsPerPage) => {
                  setRowsPerPage(newItemsPerPage);
                  setCurrentPage(1);
                }}
                showPageNumbers={true}
                variant="light"
              />
            )}
          </div>

        </div>
      </div>
    </div>
  );
};

export default DatabasePOC;