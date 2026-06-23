// Import direto do módulo interno evita o bloco de auto-teste do index.js do
// pdf-parse (que tenta ler um PDF de exemplo quando empacotado pelo Next).
declare module "pdf-parse/lib/pdf-parse.js" {
  import pdf from "pdf-parse";
  export default pdf;
}
