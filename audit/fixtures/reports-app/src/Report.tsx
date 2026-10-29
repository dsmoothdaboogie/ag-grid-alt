import { AgGridReact } from 'ag-grid-react';
import { ModuleRegistry } from 'ag-grid-community';
import { AllEnterpriseModule } from 'ag-grid-enterprise';
ModuleRegistry.registerModules([AllEnterpriseModule]);

export function Report({ rows }) {
  const getDataPath = (d) => d.path;
  return <AgGridReact rowData={rows} treeData={true} getDataPath={getDataPath}
    masterDetail detailCellRendererParams={{}} onCellSelectionChanged={() => {}} />;
}
