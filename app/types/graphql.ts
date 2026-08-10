// Shared GraphQL response payload shapes. Consumed via the GraphqlResult<TData>
// envelope (see below) so the untyped `response.json()` body maps onto a
// checked shape rather than an ad-hoc cast.

export type GraphqlUserError = { field: string | null; message: string };

export type GraphqlResult<TData> = {
  data?: TData;
  errors?: Array<{ message: string; extensions?: Record<string, unknown> }>;
};

export type DraftOrderNode = {
  id: string;
  name: string;
  totalPrice: string;
  invoiceUrl: string | null;
  invoiceSentAt: string | null;
  createdAt: string;
};

export type DraftOrderCreateData = {
  draftOrderCreate: {
    draftOrder: DraftOrderNode | null;
    userErrors: GraphqlUserError[];
  } | null;
};

export type DraftOrderInvoiceSendData = {
  draftOrderInvoiceSend: {
    draftOrder: { id: string } | null;
    userErrors: GraphqlUserError[];
  } | null;
};

export type ProductSearchNode = {
  id: string;
  title: string;
  handle: string;
  status: string;
};

export type ProductsSearchData = {
  products: { nodes: ProductSearchNode[] };
};
