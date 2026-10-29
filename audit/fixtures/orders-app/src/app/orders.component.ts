import { Component } from '@angular/core';
import { ColDef, GridApi, GridReadyEvent } from 'ag-grid-community';
import { LicenseManager } from 'ag-grid-enterprise';
import {
  RowGroupingModule,
  SetFilterModule,
  ExcelExportModule,
} from 'ag-grid-enterprise';

LicenseManager.setLicenseKey('xxx');

@Component({ selector: 'app-orders', templateUrl: './orders.component.html' })
export class OrdersComponent {
  private api!: GridApi;
  const pivot = 5; // should NOT count: not an object key
  columnDefs: ColDef[] = [
    { field: 'region', rowGroup: true, filter: 'agSetColumnFilter' },
    { field: 'amount', aggFunc: 'sum' },
    { field: 'status', cellEditor: 'agRichSelectCellEditor' },
  ];
  autoGroupColumnDef = { headerName: 'Region' };
  statusBar = { statusPanels: [{ statusPanel: 'agTotalRowCountComponent' }] };
  onGridReady(e: GridReadyEvent) { this.api = e.api; }
  export() { this.api.exportDataAsExcel(); }
  legacy() { this.columnApi.getColumns(); }
}
