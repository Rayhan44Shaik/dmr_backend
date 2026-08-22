// src/modules/collections/pages/CollectionEntryPage.tsx

import { useState } from "react";
import useCollectionEntry from "../hooks/useCollectionEntry";
import CollectionInformation from "../components/entry/CollectionInformation";
import OutstandingSummary from "../components/entry/OutstandingSummary";
import CollectionAmount from "../components/entry/CollectionAmount";
import RecentCollectionsTable from "../components/entry/RecentCollectionsTable";
import { EditCollectionModal } from "../components/pending/EditCollectionModal";
import { useSafeNotification } from "../../../../hooks/useSafeNotification";

type Props = {
  embedded?: boolean;
};

export default function CollectionEntryPage({ embedded: _embedded = false }: Props) {
  const vm = useCollectionEntry();
  const { showNotification } = useSafeNotification();

  const [selectedShop, setSelectedShop] = useState<string | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editMode, setEditMode] = useState<"view" | "edit">("view");

  const handleViewShop = (shopName: string) => {
    setSelectedShop(shopName);
    setEditMode("view");
    setIsEditModalOpen(true);
  };

  const closeModal = () => {
    setIsEditModalOpen(false);
    setSelectedShop(null);
  };

  const handleSaveCollection = async () => {
    try {
      await vm.saveCollection();
      showNotification("Collection saved successfully!", "success");
    } catch (err) {
      showNotification("Failed to save collection. Please try again.", "error");
    }
  };

  // Content matching the exact vertical layout and structure of RatesEntryPage
  const content = (
    <div className="w-full space-y-5">
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-4 md:p-6">
        <CollectionInformation
          entry={vm.entry}
          errors={vm.errors}
          shops={vm.shops}
          collectors={vm.collectors}
          paymentModes={vm.paymentModes}
          onDateChange={vm.changeCollectionDate}
          onShopChange={vm.changeShop}
          onCollectorChange={vm.changeCollector}
          onPaymentModeChange={vm.changePaymentMode}
          onReferenceChange={vm.changeReference}
          onViewLedger={vm.viewLedger}
          onReset={vm.resetEntry}
          ledgerLoading={vm.ledgerLoading}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-10 gap-6 items-stretch">
        <div className="lg:col-span-5 min-w-0">
          <OutstandingSummary
            openingBalance={vm.openingBalance}
            approvedSales={vm.approvedSales}
            approvedCollections={vm.approvedCollections}
            pendingApproval={vm.pendingApproval}
            currentOutstanding={vm.currentOutstanding}
            showSummary={vm.showSummary}
            ledgerLoaded={vm.ledgerLoaded}
            shopName={vm.entry.shopName}
            periodLabel={vm.weekRangeFormatted}
            periodType="weekly"
          />
        </div>
        <div className="lg:col-span-5 min-w-0">
          <CollectionAmount
            amount={vm.entry.amount}
            remarks={vm.entry.remarks}
            currentOutstanding={vm.currentOutstanding}
            receivedToday={vm.todayCollection}
            projectedBalance={vm.projectedBalance}
            showSummary={vm.showSummary}
            ledgerLoaded={vm.ledgerLoaded}
            amountError={vm.errors?.amount}
            onAmountChange={vm.changeAmount}
            onRemarksChange={vm.changeRemarks}
            onSave={handleSaveCollection}
            onCancel={vm.cancelCollection}
            isSaving={vm.isSaving}
            disableSave={vm.disableSave}
          />
        </div>
      </div>

      <RecentCollectionsTable
        collections={vm.recentCollections}
        statusFilter={vm.statusFilter}
        pendingApprovalCount={vm.pendingApprovalCount}
        onStatusChange={vm.changeStatusFilter}
        onApprove={vm.approveCollection}
        onReject={vm.rejectCollection}
        onEdit={vm.editCollection}
        onDelete={vm.deleteCollection}
        onViewShop={handleViewShop}
      />

      <EditCollectionModal
        isOpen={isEditModalOpen}
        onClose={closeModal}
        shopName={selectedShop || ""}
        mode={editMode}
        allCollections={vm.allCollections || []}
        onRefresh={vm.refreshPage}
      />
    </div>
  );

  return content;
}