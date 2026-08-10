// Shared Admin GraphQL operation strings, defined once so the same query or
// mutation isn't duplicated across routes. Response types live in
// app/types/graphql.ts.

// Build a Draft Order from the merchant's quoted prices. `originalUnitPrice`
// is what the customer pays regardless of the catalog price.
export const CREATE_DRAFT_ORDER = `#graphql
  mutation CreateDraftOrder($input: DraftOrderInput!) {
    draftOrderCreate(input: $input) {
      draftOrder {
        id
        name
        totalPrice
        invoiceUrl
        invoiceSentAt
        createdAt
      }
      userErrors { field message }
    }
  }`;

// Email the customer an invoice for an existing Draft Order. This is the
// "send quote to customer" step — Shopify handles delivery.
export const SEND_DRAFT_ORDER_INVOICE = `#graphql
  mutation SendDraftOrderInvoice($draftOrderId: ID!, $email: String!) {
    draftOrderInvoiceSend(draftOrderId: $draftOrderId, email: $email) {
      draftOrder { id }
      userErrors { field message }
    }
  }`;

// Current price + status for one variant, used to verify a storefront
// submission against the real catalog and snapshot titles/images.
export const GET_VARIANT = `#graphql
  query GetVariant($id: ID!) {
    productVariant(id: $id) {
      id
      price
      sku
      title
      product {
        id
        title
        handle
        featuredImage { url }
      }
    }
  }`;

// Product picker + eligibility whitelist: search products and their variants.
export const SEARCH_PRODUCTS = `#graphql
  query SearchProducts($query: String!, $first: Int!) {
    products(query: $query, first: $first) {
      nodes {
        id
        title
        handle
        status
      }
    }
  }`;

// Product name + variants for a product-picker selection (by IDs).
export const GET_PRODUCTS_BY_ID = `#graphql
  query GetProductsById($ids: [ID!]!) {
    nodes(ids: $ids) {
      __typename
      ... on Product {
        id
        title
        handle
        status
      }
    }
  }`;
