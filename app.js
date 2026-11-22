const WHATSAPP_NUMBER = "5562994150444";
const DEFAULT_CATEGORIES = ["Ofertas","Copos","Especiais","Combos","Monte do seu jeito"];
const DEFAULT_PAYMENTS = ["Pix","Dinheiro","Cartão de crédito","Cartão de débito"];
const STORAGE_KEY = "formulaAcaiCardapio_v1";

const seed = {
  categories: DEFAULT_CATEGORIES,
  payments: DEFAULT_PAYMENTS,
  spoonPrice: 0,
  deliveryRadiusKm: 10,
  deliveryPrices: [0,0,0,0,0,0,0,0,0,0],
  storeLatitude: -16.608838,
  storeLongitude: -49.308809,
  accompanimentLimit: 3,
  creamLimit: 2,
  cupSizes: ["300 ml","500 ml","700 ml","1 litro"],
  creamOptions: [
    {id:"cr-1",name:"Creme de ninho",active:true},
    {id:"cr-2",name:"Creme de avelã",active:true},
    {id:"cr-3",name:"Calda de chocolate",active:true}
  ],
  customOptions: [
    {id:"c-1",name:"Banana",active:true},
    {id:"c-2",name:"Granola",active:true},
    {id:"c-3",name:"Leite condensado",active:true},
    {id:"c-4",name:"Leite em pó",active:true},
    {id:"c-5",name:"Morango",active:true}
  ],
  products: [
    {id:"demo-1",name:"Copão de Açaí",description:"Açaí cremoso para matar a vontade. Personalize com seus acompanhamentos favoritos.",price:17, type:"custom",categories:["Copos","Ofertas"],active:true,image:"",accompaniments:["Banana","Granola"]},
    {id:"demo-2",name:"Açaizão 1L",description:"Muito mais açaí, muito mais sabor, muito mais cremosidade.",price:33.25,type:"ready",categories:["Especiais"],active:true,image:"",accompaniments:[]},
    {id:"demo-3",name:"Combo Família",description:"Três copos de açaí com leite condensado, granola, banana e o que mais você quiser adicionar.",price:17,type:"ready",categories:["Combos","Ofertas"],active:true,image:"",accompaniments:[]}
  ],
  addons: [
    {id:"a-1",name:"Leite condensado",price:2,active:true},
    {id:"a-2",name:"Leite em pó",price:2.5,active:true},
    {id:"a-3",name:"Granola",price:2,active:true},
    {id:"a-4",name:"Morango",price:3,active:true},
    {id:"a-5",name:"Banana",price:2,active:true}
  ],
  cart:[]
};
let state = loadState();
let selectedCategory = "Todos";
let currentProduct = null;
let selectedImageData = "";
let toastTimer;
let deliveryCheck = null;
let supabaseClient = null;
let cloudSession = null;
let cloudHasData = false;
let applyingCloudState = false;
let cloudSaveTimer = null;
let cloudChannel = null;
const CLOUD_ROW_ID = "formula-acai-main";

function clone(obj){return JSON.parse(JSON.stringify(obj))}
function loadState(){
  try {
    const saved=localStorage.getItem(STORAGE_KEY);
    if(saved){
      const parsed=JSON.parse(saved);
      return {...clone(seed),...parsed,
        customOptions: parsed.customOptions || clone(seed.customOptions),
        creamOptions: parsed.creamOptions || clone(seed.creamOptions),
        accompanimentLimit: Number(parsed.accompanimentLimit ?? seed.accompanimentLimit),
        creamLimit: Number(parsed.creamLimit ?? seed.creamLimit),
        cupSizes: Array.isArray(parsed.cupSizes) && parsed.cupSizes.length ? parsed.cupSizes : clone(seed.cupSizes),
        products: (parsed.products || seed.products).map(p => ({...p,
          maxAccompaniments: Number(p.maxAccompaniments ?? parsed.accompanimentLimit ?? seed.accompanimentLimit),
          maxCreams: Number(p.maxCreams ?? parsed.creamLimit ?? seed.creamLimit)
        })),
        spoonPrice: Number(parsed.spoonPrice ?? 0),
        deliveryRadiusKm: Number(parsed.deliveryRadiusKm ?? seed.deliveryRadiusKm),
        deliveryPrices: Array.from({length:10},(_,i)=>Math.max(0,Number(parsed.deliveryPrices?.[i] ?? seed.deliveryPrices[i]))),
        storeLatitude: Number(parsed.storeLatitude ?? seed.storeLatitude),
        storeLongitude: Number(parsed.storeLongitude ?? seed.storeLongitude)
      };
    }
  } catch(e){}
  return clone(seed);
}
function saveState(){
  try {
    localStorage.setItem(STORAGE_KEY,JSON.stringify(state));
    renderAll();
    if (!applyingCloudState) scheduleCloudSave();
    return true;
  } catch(error) {
    console.error("Falha ao salvar o cardápio:", error);
    toast(error && error.name === "QuotaExceededError"
      ? "O armazenamento do navegador está cheio. Reduza o tamanho das imagens e tente novamente."
      : "Não foi possível salvar. Verifique os dados e tente novamente.");
    return false;
  }
}
function setCloudStatus(message, badge="") {
  const status=document.getElementById("cloudSyncStatus");
  const tag=document.getElementById("cloudStatusBadge");
  if(status) status.textContent=message;
  if(tag) tag.textContent=badge || (cloudHasData ? "Sincronizado" : "Conectado");
}
function cloudPayload(){
  const payload=clone(state);
  delete payload.cart;
  return payload;
}
function applyCloudPayload(payload){
  if(!payload || typeof payload!=="object") return;
  applyingCloudState=true;
  const localCart=state.cart || [];
  state={...clone(seed),...payload,cart:localCart};
  try{localStorage.setItem(STORAGE_KEY,JSON.stringify(state));}catch(e){console.warn("Não foi possível atualizar o cache local",e);}
  renderAll();
  applyingCloudState=false;
}
function scheduleCloudSave(){
  if(!supabaseClient || !cloudSession || applyingCloudState || !cloudHasData) return;
  clearTimeout(cloudSaveTimer);
  cloudSaveTimer=setTimeout(saveCloudState,900);
}
async function saveCloudState(){
  if(!supabaseClient || !cloudSession || !cloudHasData || applyingCloudState) return;
  const {error}=await supabaseClient.from("store_state").upsert({id:CLOUD_ROW_ID,payload:cloudPayload(),updated_at:new Date().toISOString()},{onConflict:"id"});
  if(error){console.error("Erro ao sincronizar Supabase:",error);setCloudStatus("Não foi possível sincronizar. Verifique a conexão e as políticas da tabela.","Erro");}
  else setCloudStatus("Alterações salvas na nuvem. Os outros dispositivos receberão a atualização automaticamente.","Sincronizado");
}
async function publishInitialCloudState(){
  if(!cloudSession){toast("Entre na conta administrativa antes de enviar os dados.");return;}
  const button=document.getElementById("publishCloudState");
  button.disabled=true;button.textContent="Enviando…";
  const {data,error}=await supabaseClient.from("store_state").insert({id:CLOUD_ROW_ID,payload:cloudPayload(),updated_at:new Date().toISOString()}).select().maybeSingle();
  button.disabled=false;button.textContent="Enviar dados locais para a nuvem";
  if(error){console.error(error);setCloudStatus(error.code==="23505"?"Já existe um cardápio na nuvem. Atualize a página para carregá-lo.":"Falha ao enviar. Confira a tabela, as políticas RLS e sua conta administrativa.","Erro");return;}
  cloudHasData=true;button.classList.add("hidden");setCloudStatus("Dados locais enviados. A sincronização automática está ativa.","Sincronizado");
}
async function refreshCloudState(){
  if(!supabaseClient)return;
  const {data,error}=await supabaseClient.from("store_state").select("payload,updated_at").eq("id",CLOUD_ROW_ID).maybeSingle();
  if(error){console.error("Falha ao carregar cardápio da nuvem:",error);setCloudStatus("Não foi possível carregar a nuvem. Confira a configuração SQL e a conexão.","Atenção");return;}
  if(data?.payload){cloudHasData=true;applyCloudPayload(data.payload);setCloudStatus("Cardápio carregado da nuvem. Atualizações automáticas ativadas.","Sincronizado");}
  else {cloudHasData=false;setCloudStatus(cloudSession?"A tabela está vazia. Use o botão abaixo para publicar os dados deste dispositivo.":"A tabela ainda não possui cardápio. A loja precisa entrar como administradora e publicar os dados iniciais.","Aguardando carga");}
  const publish=document.getElementById("publishCloudState");if(publish)publish.classList.toggle("hidden",!cloudSession||cloudHasData);
}
function updateCloudAdminUI(){
  const email=document.getElementById("cloudAdminEmail"),logout=document.getElementById("cloudAdminLogout"),publish=document.getElementById("publishCloudState");
  if(email)email.textContent=cloudSession?`Conta administrativa: ${cloudSession.user.email||"conectada"}`:"Nenhuma conta administrativa conectada.";
  if(logout)logout.classList.toggle("hidden",!cloudSession);
  if(publish)publish.classList.toggle("hidden",!cloudSession||cloudHasData);
}
async function initCloud(){
  const cfg=window.FORMULA_SUPABASE_CONFIG;
  if(!window.supabase?.createClient||!cfg?.url||!cfg?.publishableKey){setCloudStatus("Biblioteca ou configuração do Supabase indisponível.","Offline");return;}
  supabaseClient=window.supabase.createClient(cfg.url,cfg.publishableKey);
  const {data:{session}}=await supabaseClient.auth.getSession();cloudSession=session;updateCloudAdminUI();
  await refreshCloudState();
  supabaseClient.auth.onAuthStateChange((_event,session)=>{
    cloudSession=session;updateCloudAdminUI();
    setTimeout(async()=>{await refreshCloudState();if(cloudSession)updateCloudAdminUI();},0);
  });
  cloudChannel=supabaseClient.channel("formula-acai-store-state").on("postgres_changes",{event:"*",schema:"public",table:"store_state",filter:`id=eq.${CLOUD_ROW_ID}`},payload=>{
    if(payload.new?.payload){cloudHasData=true;applyCloudPayload(payload.new.payload);setCloudStatus("Cardápio atualizado automaticamente pela nuvem.","Sincronizado");}
  }).subscribe(status=>{if(status==="SUBSCRIBED")console.info("Realtime Supabase conectado.");});
}

function money(v){return Number(v||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});}
function productStartingPrice(p){if(p.type!=="custom"||(p.useSizes===false))return Number(p.price||0);const prices=(Array.isArray(p.availableSizes)&&p.availableSizes.length?p.availableSizes:(state.cupSizes||[])).map(size=>Number(p.sizePrices?.[size]??p.price));return prices.length?Math.min(...prices):Number(p.price||0);}
function uid(){return "id-"+Date.now().toString(36)+"-"+Math.random().toString(36).slice(2,8);}
function escapeHtml(s=""){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function toast(message){const el=document.getElementById("toast");el.textContent=message;el.classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove("show"),2600);}
function activeProducts(){return state.products.filter(p=>p.active);}
function itemTotal(item){const spoonQty=Number(item.spoonQty ?? (item.wantsSpoon?1:0));return (Number(item.price)+(item.addons||[]).reduce((s,a)=>s+a.price,0)+(spoonQty*Number(item.spoonPrice||0)))*item.qty;}
function cartTotal(){return state.cart.reduce((s,i)=>s+itemTotal(i),0);}
function renderAll(){renderCategories();renderProducts();renderCart();renderAdminProducts();renderAdminCategories();renderAdminAddons();renderAdminCustomOptions();renderAdminCreamOptions();renderPaymentOptions();}

function renderCategories(){
  const cats=["Todos",...state.categories];
  document.getElementById("categoryNav").innerHTML=cats.map(c=>`<button class="category-chip ${selectedCategory===c?"active":""}" data-category="${escapeHtml(c)}">${escapeHtml(c)}</button>`).join("");
  document.querySelectorAll("[data-category]").forEach(b=>b.addEventListener("click",()=>{selectedCategory=b.dataset.category;renderCategories();renderProducts();}));
}
function renderProducts(){
  const list=activeProducts().filter(p=>selectedCategory==="Todos"||p.categories.includes(selectedCategory));
  document.getElementById("productGrid").innerHTML=list.map(p=>`
    <article class="product-card" data-product="${p.id}">
      ${p.image?`<img src="${p.image}" alt="${escapeHtml(p.name)}">`:`<div class="product-placeholder">🍇</div>`}
      <div class="product-info"><h3>${escapeHtml(p.name)}</h3><p>${escapeHtml(p.description)}</p>
      <div class="price-from"><span class="from-label">A partir de</span> <strong>${money(productStartingPrice(p))}</strong></div><span class="add-hint">Ver produto →</span></div>
    </article>`).join("");
  document.getElementById("emptyProducts").classList.toggle("hidden",list.length>0);
  document.querySelectorAll("[data-product]").forEach(card=>card.addEventListener("click",()=>openProduct(card.dataset.product)));
}
function renderCart(){
  const count=state.cart.reduce((s,i)=>s+i.qty,0),total=cartTotal();
  document.getElementById("cartCount").textContent=count;
  document.getElementById("topCartCount").textContent=count;
  document.getElementById("cartTotal").textContent=money(total);
  document.getElementById("cartHint").textContent=count?`${count} item(ns) no seu pedido`:"Adicione seus favoritos";
  document.getElementById("checkoutButton").disabled=count===0;
  document.getElementById("cartBar").classList.remove("hidden");
}
function openProduct(id){
  const p=state.products.find(x=>x.id===id);if(!p||!p.active)return;
  currentProduct=p;
  document.getElementById("homePage").classList.add("hidden");
  document.getElementById("checkoutPage").classList.add("hidden");
  document.getElementById("productPage").classList.remove("hidden");
  document.getElementById("cartBar").classList.add("hidden");
  const addons=state.addons.filter(a=>a.active);
  const customOptions=state.customOptions.filter(o=>o.active);
  const creamOptions=state.creamOptions.filter(o=>o.active);
  const maxAccompaniments=Number(p.maxAccompaniments ?? state.accompanimentLimit);
  const maxCreams=Number(p.maxCreams ?? state.creamLimit);
  const useSizes=p.type==="custom" && (p.useSizes===undefined ? true : !!p.useSizes);
  const availableSizes=(Array.isArray(p.availableSizes)&&p.availableSizes.length?p.availableSizes:state.cupSizes);
  const sizePriceMap=p.sizePrices||{};
  const initialPrice=useSizes?Math.min(...availableSizes.map(size=>Number(sizePriceMap[size]??p.price))):Number(p.price);
  document.getElementById("productDetail").innerHTML=`
    <div class="detail-layout">
      <div>${p.image?`<img class="detail-image" src="${p.image}" alt="${escapeHtml(p.name)}">`:`<div class="product-placeholder detail-image">🍇</div>`}</div>
      <div class="detail-content"><span class="eyebrow purple">FÓRMULA AÇAÍ</span><h1>${escapeHtml(p.name)}</h1><p class="detail-description">${escapeHtml(p.description)}</p><div class="detail-price">A partir de ${money(productStartingPrice(p))}</div>
      ${p.type==="custom"?`${useSizes?`<div class="option-group"><h3>Tamanho do copo</h3><label class="cup-size-field">Selecione o tamanho<select id="cupSizeChoice" required><option value="">Escolha o tamanho</option>${availableSizes.map(size=>`<option value="${escapeHtml(size)}">${escapeHtml(size)} · ${money(sizePriceMap[size]??p.price)}</option>`).join("")}</select></label></div>`:""}<div class="option-group"><h3>Acompanhamentos <small class="choice-limit">Escolha até ${maxAccompaniments}</small></h3>${customOptions.length?customOptions.map(o=>`<div class="option-row"><label><input type="checkbox" class="custom-choice" value="${escapeHtml(o.name)}"> ${escapeHtml(o.name)}</label><span>Incluso</span></div>`).join(""):`<p class="muted tiny">A loja ainda não cadastrou opções de montagem.</p>`}</div><div class="option-group"><h3>Cremes e caldas <small class="choice-limit">Escolha até ${maxCreams}</small></h3>${creamOptions.length?creamOptions.map(o=>`<div class="option-row"><label><input type="checkbox" class="cream-choice" value="${escapeHtml(o.name)}"> ${escapeHtml(o.name)}</label><span>Incluso</span></div>`).join(""):`<p class="muted tiny">A loja ainda não cadastrou cremes ou caldas.</p>`}</div>`:""}
      <div class="option-group"><h3>Deseja adicionar algo?</h3>${addons.length?addons.map(a=>`<div class="option-row"><label><input type="checkbox" class="addon-choice" data-id="${a.id}"> ${escapeHtml(a.name)}</label><span>+ ${money(a.price)}</span></div>`).join(""):`<p class="muted tiny">Nenhum adicional disponível no momento.</p>`}</div>
      <div class="option-group"><h3>Quantidade de colheres</h3><div class="option-row spoon-quantity-row"><label for="spoonQuantity">Quantas colheres deseja?</label><input id="spoonQuantity" class="spoon-quantity-input" type="number" min="0" max="20" step="1" value="0" inputmode="numeric"><span>Unitária: ${Number(state.spoonPrice)>0?money(state.spoonPrice):"Grátis"}</span></div><p class="tiny muted">Escolha 0 se não quiser colher. O valor será calculado por unidade.</p></div>
      <div class="option-group"><h3>Quantidade</h3><div class="qty-control"><button type="button" id="qtyMinus">−</button><strong id="productQty">1</strong><button type="button" id="qtyPlus">+</button></div></div>
      <button id="addProductToCart" class="primary-button detail-add"><span>Adicionar ao pedido</span><strong id="detailButtonPrice">${money(p.price)}</strong></button></div>
    </div>`;
  let qty=1;
  const selectedBasePrice=()=>useSizes?(document.getElementById("cupSizeChoice")?.value?Number(sizePriceMap[document.getElementById("cupSizeChoice").value]??p.price):initialPrice):Number(p.price);
  const updatePrice=()=>{const extra=[...document.querySelectorAll(".addon-choice:checked")].reduce((s,c)=>s+Number(state.addons.find(a=>a.id===c.dataset.id)?.price||0),0)+(Math.max(0,Math.min(20,Number(document.getElementById("spoonQuantity")?.value||0)))*Number(state.spoonPrice));document.getElementById("detailButtonPrice").textContent=money((selectedBasePrice()+extra)*qty);};
  document.getElementById("cupSizeChoice")?.addEventListener("change",updatePrice);
  document.getElementById("qtyMinus").onclick=()=>{qty=Math.max(1,qty-1);document.getElementById("productQty").textContent=qty;updatePrice();};
  document.getElementById("qtyPlus").onclick=()=>{qty++;document.getElementById("productQty").textContent=qty;updatePrice();};
  document.querySelectorAll(".addon-choice").forEach(c=>c.addEventListener("change",updatePrice));
  const enforceLimit=(selector,limit,label)=>document.querySelectorAll(selector).forEach(c=>c.addEventListener("change",()=>{const checked=document.querySelectorAll(`${selector}:checked`);if(checked.length>limit){c.checked=false;toast(`Você pode escolher até ${limit} ${label}.`);}}));
  enforceLimit(".custom-choice",maxAccompaniments,"acompanhamento(s)");
  enforceLimit(".cream-choice",maxCreams,"creme(s) ou calda(s)");
  document.getElementById("spoonQuantity").addEventListener("input",e=>{const n=Math.max(0,Math.min(20,Math.floor(Number(e.target.value||0))));if(String(n)!==e.target.value)e.target.value=n;updatePrice();});
  updatePrice();
  document.getElementById("addProductToCart").onclick=()=>{
    const chosen=[...document.querySelectorAll(".addon-choice:checked")].map(c=>{const a=state.addons.find(x=>x.id===c.dataset.id);return {id:a.id,name:a.name,price:Number(a.price)};});
    const customChosen=[...document.querySelectorAll(".custom-choice:checked")].map(c=>c.value);
    const creamChosen=[...document.querySelectorAll(".cream-choice:checked")].map(c=>c.value);
    if(customChosen.length>maxAccompaniments){toast(`Escolha no máximo ${maxAccompaniments} acompanhamento(s).`);return;}
    if(creamChosen.length>maxCreams){toast(`Escolha no máximo ${maxCreams} creme(s) ou calda(s).`);return;}
    const cupSize=useSizes?document.getElementById("cupSizeChoice").value:"";
    if(useSizes && !cupSize){toast("Selecione o tamanho do copo.");return;}
    const spoonQty=Math.max(0,Math.min(20,Math.floor(Number(document.getElementById("spoonQuantity").value||0))));
    const finalBasePrice=selectedBasePrice();
    state.cart.push({key:uid(),productId:p.id,name:p.name,price:finalBasePrice,qty,cupSize,addons:chosen,customOptions:customChosen,creamOptions:creamChosen,spoonQty,wantsSpoon:spoonQty>0,spoonPrice:Number(state.spoonPrice)});
    saveState();showHome();toast("Produto adicionado ao pedido!");
  };
}
function showHome(){document.getElementById("productPage").classList.add("hidden");document.getElementById("checkoutPage").classList.add("hidden");document.getElementById("homePage").classList.remove("hidden");document.getElementById("cartBar").classList.remove("hidden");}
function openCheckout(){
  if(!state.cart.length)return;
  document.getElementById("homePage").classList.add("hidden");document.getElementById("productPage").classList.add("hidden");document.getElementById("checkoutPage").classList.remove("hidden");document.getElementById("cartBar").classList.add("hidden");
  document.getElementById("checkoutItems").innerHTML=state.cart.map(i=>`<div class="checkout-line"><div><strong>${i.qty}× ${escapeHtml(i.name)}</strong><small>${i.cupSize?`Tamanho: ${escapeHtml(i.cupSize)} · `:""}${[...(i.customOptions||[]),...(i.creamOptions||[]),...(i.addons||[]).map(a=>a.name)].join(", ")||"Sem complementos selecionados"}${Number(i.spoonQty ?? (i.wantsSpoon?1:0))>0?`<br>Colheres: ${Number(i.spoonQty ?? 1)} × ${money(i.spoonPrice||0)}`:"<br>Colheres: 0"}</small><button type="button" class="remove-cart-item" data-remove-cart="${i.key}">Remover este item</button></div><strong>${money(itemTotal(i))}</strong></div>`).join("");
  document.querySelectorAll("[data-remove-cart]").forEach(b=>b.onclick=()=>{state.cart=state.cart.filter(i=>i.key!==b.dataset.removeCart);saveState();if(state.cart.length)openCheckout();else showHome();toast("Item removido do pedido.");});
  document.getElementById("checkoutSubtotal").textContent=money(cartTotal());
  document.getElementById("checkoutTotal").textContent=money(cartTotal());
  const sel=document.getElementById("paymentSelect");sel.innerHTML=state.payments.map(p=>`<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`).join("");
  deliveryCheck=null;
  updateDeliveryPriceUI();
  document.getElementById("deliveryRadiusLabel").textContent=`${Number(state.deliveryRadiusKm||10).toLocaleString("pt-BR")} km`;
  setDeliveryStatus("Aguardando verificação da localização.", "pending");
  updateDeliverySubmitState();
}
let ordersViewMode="today";
async function loadAdminOrders(mode=ordersViewMode){ordersViewMode=mode;const list=document.getElementById("adminOrdersList"),status=document.getElementById("ordersStatus");if(!list||!status)return;list.innerHTML="";status.textContent="Carregando pedidos…";if(!supabaseClient||!cloudSession){status.textContent="Entre na conta administrativa para consultar os pedidos.";return;}let query=supabaseClient.from("orders").select("*").order("created_at",{ascending:false}).limit(300);if(mode==="today"){const now=new Date(),start=new Date(now.getFullYear(),now.getMonth(),now.getDate()).toISOString();query=query.gte("created_at",start);}const {data,error}=await query;if(error){console.error(error);status.textContent="Não foi possível carregar. Confirme se executou o SQL de pedidos incluído neste ZIP.";return;}status.textContent=`${data.length} pedido(s) ${mode==="today"?"registrado(s) hoje":"no histórico recente (limite de 300)"}.`;list.innerHTML=data.map(o=>{const date=new Date(o.created_at).toLocaleString("pt-BR"),items=(o.items||[]).map(i=>`${i.qty}× ${escapeHtml(i.name)} — ${money(i.total||0)}`).join("<br>");return `<div class="admin-list-item"><div class="list-main"><strong>${escapeHtml(o.customer_name||"Cliente")} · ${money(o.total)}</strong><small>${date} · ${escapeHtml(o.payment||"")}</small><small>${escapeHtml(o.address||"")}</small><small>${items}</small><small>Entrega: ${money(o.delivery_fee||0)} · ${escapeHtml(o.notes||"Sem observações")}</small></div></div>`;}).join("")||'<p class="muted">Nenhum pedido encontrado neste período.</p>';}
async function submitOrder(e){
  e.preventDefault();if(!state.cart.length)return;
  if(!isDeliveryCheckValid()){
    setDeliveryStatus("Antes de enviar, verifique sua localização e confirme que está dentro da área de entrega.","error");
    document.getElementById("deliveryCheckTitle").scrollIntoView({behavior:"smooth",block:"center"});
    return;
  }
  const fd=new FormData(e.target),data=Object.fromEntries(fd.entries());
  const lines=state.cart.map(i=>`${i.qty}x ${i.name} — ${money(itemTotal(i))}${(i.customOptions||[]).length?`\n  Acompanhamentos: ${i.customOptions.join(", ")}`:""}${i.cupSize?`\n  Tamanho do copo: ${i.cupSize}`:""}${(i.creamOptions||[]).length?`\n  Cremes e caldas: ${i.creamOptions.join(", ")}`:""}${i.addons.length?`\n  Adicionais: ${i.addons.map(a=>`${a.name} (+${money(a.price)})`).join(", ")}`:""}\n  Colheres: ${Number(i.spoonQty ?? (i.wantsSpoon?1:0))} × ${money(i.spoonPrice||0)} = ${money(Number(i.spoonQty ?? (i.wantsSpoon?1:0))*Number(i.spoonPrice||0))}`).join("\n\n");
  const deliveryFee=deliveryFeeForDistance(deliveryCheck.distance);
  const grandTotal=cartTotal()+deliveryFee;
  const chargedKm=deliveryKmBracket(deliveryCheck.distance);
  const orderRecord={customer_name:data.customerName,address:data.address,reference:data.reference||"",payment:data.payment,notes:data.notes||"",items:state.cart.map(i=>({name:i.name,qty:i.qty,cup_size:i.cupSize||"",custom_options:i.customOptions||[],cream_options:i.creamOptions||[],addons:i.addons||[],wants_spoon:Number(i.spoonQty ?? (i.wantsSpoon?1:0))>0,spoon_qty:Number(i.spoonQty ?? (i.wantsSpoon?1:0)),spoon_price:Number(i.spoonPrice||0),total:itemTotal(i)})),subtotal:cartTotal(),delivery_fee:deliveryFee,total:grandTotal,distance_km:Number(deliveryCheck.distance.toFixed(3))};
  if(!supabaseClient){toast("Não foi possível registrar o pedido no sistema. Tente novamente.");return;}
  const {error:orderError}=await supabaseClient.from("orders").insert(orderRecord);
  if(orderError){console.error("Erro ao registrar pedido:",orderError);toast("Não foi possível registrar o pedido no sistema. Tente novamente.");return;}
  const message=`🍇 *NOVO PEDIDO — FÓRMULA AÇAÍ*\n\n*Itens do pedido:*\n${lines}\n\nSubtotal dos produtos: ${money(cartTotal())}\nTaxa de entrega (${chargedKm} km): ${money(deliveryFee)}\n*Total: ${money(grandTotal)}*\n\n*Dados do cliente:*\nNome: ${data.customerName}\nEndereço: ${data.address}\nPonto de referência: ${data.reference||"Não informado"}\nDistância estimada da loja: ${deliveryCheck.distance.toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2})} km\nPagamento: ${data.payment}\nObservações: ${data.notes||"Nenhuma"}`;
  window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`,"_blank");
  state.cart=[];saveState();e.target.reset();deliveryCheck=null;showHome();toast("Pedido recebido! Envie a mensagem pelo WhatsApp.");
}

function haversineKm(lat1,lon1,lat2,lon2){
  const rad=v=>v*Math.PI/180, R=6371;
  const dLat=rad(lat2-lat1),dLon=rad(lon2-lon1);
  const a=Math.sin(dLat/2)**2+Math.cos(rad(lat1))*Math.cos(rad(lat2))*Math.sin(dLon/2)**2;
  return 2*R*Math.asin(Math.sqrt(a));
}
function deliveryKmBracket(distance){return Math.min(10,Math.max(1,Math.ceil(Number(distance)||0)));}
function deliveryFeeForDistance(distance){const km=deliveryKmBracket(distance);return Number(state.deliveryPrices?.[km-1] ?? 0);}
function updateDeliveryPriceUI(){
  const feeRow=document.getElementById("deliveryFeeRow"),distanceRow=document.getElementById("deliveryDistanceRow");
  const feeEl=document.getElementById("deliveryFeeValue"),distanceEl=document.getElementById("deliveryDistanceValue");
  const totalEl=document.getElementById("checkoutTotal");
  if(!feeRow||!totalEl)return;
  if(deliveryCheck?.inside){
    const km=deliveryKmBracket(deliveryCheck.distance),fee=deliveryFeeForDistance(deliveryCheck.distance);
    feeRow.classList.remove("hidden");distanceRow.classList.remove("hidden");
    feeEl.textContent=money(fee);distanceEl.textContent=`${deliveryCheck.distance.toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2})} km (faixa de ${km} km)`;
    totalEl.textContent=money(cartTotal()+fee);
  }else{
    feeRow.classList.add("hidden");distanceRow.classList.add("hidden");totalEl.textContent=money(cartTotal());
  }
}
function setDeliveryStatus(message,type="pending"){
  const el=document.getElementById("deliveryStatus");if(!el)return;
  el.textContent=message;el.className=`delivery-status ${type}`;
}
function isDeliveryCheckValid(){
  const address=document.getElementById("customerAddress").value.trim();
  return !!deliveryCheck && deliveryCheck.address===address && deliveryCheck.inside===true && deliveryCheck.distance<=Number(state.deliveryRadiusKm||10);
}
function updateDeliverySubmitState(){
  const btn=document.querySelector('#customerForm button[type="submit"]');if(btn)btn.disabled=!isDeliveryCheckValid();
}
function applyDeliveryCoordinates(lat,lon,source){
  const distance=haversineKm(Number(state.storeLatitude),Number(state.storeLongitude),lat,lon);
  const inside=distance<=Number(state.deliveryRadiusKm||10);
  deliveryCheck={lat,lon,distance,inside,source,address:document.getElementById("customerAddress").value.trim()};
  if(inside){const km=deliveryKmBracket(distance),fee=deliveryFeeForDistance(distance);setDeliveryStatus(`Estamos dentro da área de entrega! Distância: ${distance.toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2})} km. Taxa de entrega da faixa de ${km} km: ${money(fee)}. Você já pode finalizar o pedido.`,"success");}
  else setDeliveryStatus(`Esse endereço fica a ${distance.toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2})} km da loja, fora do nosso limite de ${Number(state.deliveryRadiusKm||10).toLocaleString("pt-BR")} km. Não será possível concluir a entrega.`,"error");
  updateDeliverySubmitState();
  updateDeliveryPriceUI();
}
async function checkTypedAddress(){
  const address=document.getElementById("customerAddress").value.trim();
  if(address.length<8){setDeliveryStatus("Digite o endereço completo antes de verificar.","error");return;}
  const btn=document.getElementById("checkTypedAddress");btn.disabled=true;btn.textContent="Verificando endereço…";
  setDeliveryStatus("Localizando o endereço informado…","pending");
  try{
    const query=new URLSearchParams({format:"jsonv2",limit:"1",countrycodes:"br",q:address+", Goiânia, Goiás, Brasil"});
    const response=await fetch(`https://nominatim.openstreetmap.org/search?${query.toString()}`,{headers:{"Accept":"application/json"}});
    if(!response.ok)throw new Error("Serviço de localização indisponível.");
    const results=await response.json();
    if(!results.length)throw new Error("Não encontramos esse endereço. Confira os dados ou use sua localização GPS.");
    applyDeliveryCoordinates(Number(results[0].lat),Number(results[0].lon),"endereço");
  }catch(error){setDeliveryStatus(error.message||"Não foi possível verificar o endereço. Tente usar sua localização GPS.","error");deliveryCheck=null;updateDeliverySubmitState();updateDeliveryPriceUI();}
  finally{btn.disabled=false;btn.textContent="Verificar endereço";}
}
function useBrowserLocation(){
  if(!navigator.geolocation){setDeliveryStatus("Este navegador não oferece localização. Tente verificar o endereço digitado.","error");return;}
  const btn=document.getElementById("useMyLocation");btn.disabled=true;btn.textContent="Obtendo localização…";
  if(!document.getElementById("customerAddress").value.trim()){
    setDeliveryStatus("Preencha seu endereço de entrega primeiro e depois use sua localização para validar a distância.","error");
    btn.disabled=false;btn.textContent="📍 Usar minha localização";return;
  }
  setDeliveryStatus("Aguardando autorização de localização do navegador…","pending");
  navigator.geolocation.getCurrentPosition(pos=>{
    applyDeliveryCoordinates(pos.coords.latitude,pos.coords.longitude,"GPS");
    btn.disabled=false;btn.textContent="📍 Usar minha localização";
  },err=>{
    const message=err.code===1?"Permita o acesso à localização no navegador ou verifique o endereço digitado.":err.code===2?"Não foi possível determinar sua localização. Tente novamente ou verifique o endereço digitado.":"A localização demorou para responder. Tente novamente ou verifique o endereço digitado.";
    setDeliveryStatus(message,"error");btn.disabled=false;btn.textContent="📍 Usar minha localização";
  },{enableHighAccuracy:true,timeout:15000,maximumAge:0});
}

function openLogin(){document.getElementById("adminLoginModal").classList.remove("hidden");document.getElementById("adminPassword").value="";document.getElementById("loginError").classList.add("hidden");}
function enterAdmin(){document.getElementById("adminLoginModal").classList.add("hidden");document.getElementById("homePage").classList.add("hidden");document.getElementById("productPage").classList.add("hidden");document.getElementById("checkoutPage").classList.add("hidden");document.getElementById("cartBar").classList.add("hidden");document.querySelector(".topbar").classList.add("hidden");document.querySelector(".site-footer").classList.add("hidden");document.getElementById("adminPage").classList.remove("hidden");renderAll();}
function exitAdmin(){document.getElementById("adminPage").classList.add("hidden");document.querySelector(".topbar").classList.remove("hidden");document.querySelector(".site-footer").classList.remove("hidden");showHome();}
function selectedProductSizes(){return [...document.querySelectorAll("[name='productCupSizeChoice']:checked")].map(x=>x.value);}
function renderProductCupSizeChecks(selected=state.cupSizes||[]){const box=document.getElementById("productCupSizeChecks");if(!box)return;box.innerHTML=(state.cupSizes||[]).map(size=>`<label class="check-option"><input type="checkbox" name="productCupSizeChoice" value="${escapeHtml(size)}" ${selected.includes(size)?"checked":""}> ${escapeHtml(size)}</label>`).join("");box.querySelectorAll("input").forEach(x=>x.addEventListener("change",()=>renderProductSizePriceFields(window.editingSizePrices||{})));}
function renderProductSizePriceFields(existing={}){const base=Number(document.getElementById("productPrice").value||0),chosen=selectedProductSizes();document.getElementById("productSizePriceFields").innerHTML=chosen.map(size=>`<label>${escapeHtml(size)} (R$)<input class="product-size-price" data-size="${escapeHtml(size)}" type="number" min="0" step="0.01" value="${Number(existing[size]??base)}"></label>`).join("");}
function updateProductTypeFields(){const custom=document.getElementById("productType").value==="custom",sizesOn=document.getElementById("productUseSizes").checked;document.getElementById("customProductSettings").classList.toggle("hidden",!custom);document.getElementById("productCupSizeChoices").classList.toggle("hidden",!custom||!sizesOn);document.getElementById("productSizePrices").classList.toggle("hidden",!custom||!sizesOn);if(custom&&sizesOn){renderProductCupSizeChecks(window.editingAvailableSizes||state.cupSizes||[]);renderProductSizePriceFields(window.editingSizePrices||{});}}

function resetProductForm(){document.getElementById("productForm").reset();document.getElementById("editProductId").value="";document.getElementById("productFormTitle").textContent="Adicionar produto";document.getElementById("imagePreview").textContent="Prévia da imagem";document.getElementById("productActive").checked=true;document.getElementById("productAccompanimentLimit").value=state.accompanimentLimit;document.getElementById("productCreamLimit").value=state.creamLimit;document.getElementById("productUseSizes").checked=false;window.editingSizePrices={};window.editingAvailableSizes=state.cupSizes||[];selectedImageData="";renderProductFormChoices();updateProductTypeFields();}
function renderProductFormChoices(){
  document.getElementById("productCategories").innerHTML=state.categories.map(c=>`<label class="check-option"><input type="checkbox" name="categoryChoice" value="${escapeHtml(c)}"> ${escapeHtml(c)}</label>`).join("");
  const accomp=Array.from(new Set(state.products.flatMap(p=>p.accompaniments||[])));
  document.getElementById("customAccompaniments").innerHTML=(accomp.length?accomp:["Banana","Granola","Leite condensado"]).map(a=>`<label class="check-option"><input type="checkbox" name="accompChoice" value="${escapeHtml(a)}"> ${escapeHtml(a)}</label>`).join("");
}
function editProduct(id){
  const p=state.products.find(x=>x.id===id);if(!p)return;
  resetProductForm();document.getElementById("editProductId").value=p.id;document.getElementById("productFormTitle").textContent="Editar produto";
  document.getElementById("productName").value=p.name;document.getElementById("productDescription").value=p.description;document.getElementById("productPrice").value=p.price;document.getElementById("productType").value=p.type;document.getElementById("productActive").checked=p.active;document.getElementById("productAccompanimentLimit").value=p.maxAccompaniments??state.accompanimentLimit;document.getElementById("productCreamLimit").value=p.maxCreams??state.creamLimit;document.getElementById("productUseSizes").checked=p.type==="custom"&&(p.useSizes===undefined?true:!!p.useSizes);window.editingSizePrices=p.sizePrices||{};window.editingAvailableSizes=p.availableSizes?.length?p.availableSizes:(state.cupSizes||[]);selectedImageData=p.image||"";updateProductTypeFields();
  document.getElementById("imagePreview").innerHTML=p.image?`<img src="${p.image}" alt="Prévia">`:"Prévia da imagem";
  document.querySelectorAll('[name="categoryChoice"]').forEach(c=>c.checked=p.categories.includes(c.value));
  document.querySelectorAll('[name="accompChoice"]').forEach(c=>c.checked=(p.accompaniments||[]).includes(c.value));
  window.scrollTo({top:0,behavior:"smooth"});
}
function renderAdminCategories(){const list=document.getElementById("adminCategoryList");if(!list)return;list.innerHTML=state.categories.map(c=>`<div class="admin-list-item"><div class="list-main"><strong>${escapeHtml(c)}</strong></div><div class="list-actions"><button type="button" class="small-button danger" data-delete-category="${escapeHtml(c)}">Excluir categoria</button></div></div>`).join("")||'<p class="muted">Nenhuma categoria cadastrada.</p>';list.querySelectorAll("[data-delete-category]").forEach(btn=>btn.onclick=()=>{const name=btn.dataset.deleteCategory;if(!confirm(`Excluir a categoria "${name}"? Os produtos associados ficarão sem essa categoria.`))return;state.categories=state.categories.filter(c=>c!==name);state.products.forEach(p=>p.categories=(p.categories||[]).filter(c=>c!==name));if(selectedCategory===name)selectedCategory="Todos";saveState();renderProductFormChoices();toast("Categoria excluída.");});}
function addCategory(){const input=document.getElementById("newCategoryName"),name=input.value.trim();if(!name)return toast("Digite o nome da categoria.");if(state.categories.some(c=>c.toLowerCase()===name.toLowerCase()))return toast("Essa categoria já existe.");state.categories.push(name);input.value="";saveState();renderProductFormChoices();toast("Categoria adicionada.");}
function renderAdminProducts(){
  const list=document.getElementById("adminProductList");if(!list)return;
  document.getElementById("adminProductCount").textContent=state.products.length;
  list.innerHTML=state.products.map(p=>`<div class="admin-list-item ${p.active?"":"inactive"}">${p.image?`<img src="${p.image}" alt="">`:`<div class="list-thumb">🍇</div>`}<div class="list-main"><strong>${escapeHtml(p.name)}</strong><small>${money(p.price)} · ${p.type==="custom"?"Personalizado":"Pronto"} · ${(p.categories||[]).join(", ")}</small><small>${p.active?"Ativo":"Inativo"}</small></div><div class="list-actions"><button class="small-button" data-edit-product="${p.id}">Editar</button><button class="small-button" data-toggle-product="${p.id}">${p.active?"Inativar":"Ativar"}</button><button class="small-button danger" data-delete-product="${p.id}">Excluir</button></div></div>`).join("")||'<p class="muted">Nenhum produto cadastrado.</p>';
  document.querySelectorAll("[data-edit-product]").forEach(b=>b.onclick=()=>editProduct(b.dataset.editProduct));
  document.querySelectorAll("[data-toggle-product]").forEach(b=>b.onclick=()=>{const p=state.products.find(x=>x.id===b.dataset.toggleProduct);p.active=!p.active;saveState();toast(p.active?"Produto ativado.":"Produto inativado.");});
  document.querySelectorAll("[data-delete-product]").forEach(b=>b.onclick=()=>{const p=state.products.find(x=>x.id===b.dataset.deleteProduct);if(confirm(`Tem certeza de que deseja excluir "${p.name}"? Esta ação não poderá ser desfeita.`)){state.products=state.products.filter(x=>x.id!==p.id);saveState();toast("Produto excluído.");}});
}
function renderAdminAddons(){
  const list=document.getElementById("adminAddonList");if(!list)return;
  list.innerHTML=state.addons.map(a=>`<div class="admin-list-item ${a.active?"":"inactive"}"><div class="list-thumb">＋</div><div class="list-main"><strong>${escapeHtml(a.name)}</strong><small>${money(a.price)} · ${a.active?"Ativo":"Inativo"}</small></div><div class="list-actions"><button class="small-button" data-edit-addon="${a.id}">Editar</button><button class="small-button" data-toggle-addon="${a.id}">${a.active?"Inativar":"Ativar"}</button><button class="small-button danger" data-delete-addon="${a.id}">Excluir</button></div></div>`).join("")||'<p class="muted">Nenhum adicional cadastrado.</p>';
  document.querySelectorAll("[data-edit-addon]").forEach(b=>b.onclick=()=>{const a=state.addons.find(x=>x.id===b.dataset.editAddon);document.getElementById("editAddonId").value=a.id;document.getElementById("addonName").value=a.name;document.getElementById("addonPrice").value=a.price;document.getElementById("addonActive").checked=a.active;document.getElementById("addonFormTitle").textContent="Editar adicional";});
  document.querySelectorAll("[data-toggle-addon]").forEach(b=>b.onclick=()=>{const a=state.addons.find(x=>x.id===b.dataset.toggleAddon);a.active=!a.active;saveState();toast(a.active?"Adicional ativado.":"Adicional inativado.");});
  document.querySelectorAll("[data-delete-addon]").forEach(b=>b.onclick=()=>{const a=state.addons.find(x=>x.id===b.dataset.deleteAddon);if(confirm(`Excluir o adicional "${a.name}"?`)){state.addons=state.addons.filter(x=>x.id!==a.id);saveState();toast("Adicional excluído.");}});
}
function resetCustomOptionForm(){
  document.getElementById("customOptionForm").reset();
  document.getElementById("editCustomOptionId").value="";
  document.getElementById("customOptionFormTitle").textContent="Adicionar opção de montagem";
  document.getElementById("customOptionActive").checked=true;
}
function renderAdminCustomOptions(){
  const list=document.getElementById("adminCustomOptionList");if(!list)return;
  list.innerHTML=state.customOptions.map(o=>`<div class="admin-list-item ${o.active?"":"inactive"}"><div class="list-thumb">🍓</div><div class="list-main"><strong>${escapeHtml(o.name)}</strong><small>${o.active?"Ativa para o cliente":"Inativa"}</small></div><div class="list-actions"><button class="small-button" data-edit-custom="${o.id}">Editar</button><button class="small-button" data-toggle-custom="${o.id}">${o.active?"Inativar":"Ativar"}</button><button class="small-button danger" data-delete-custom="${o.id}">Excluir</button></div></div>`).join("")||'<p class="muted">Nenhuma opção cadastrada.</p>';
  document.querySelectorAll("[data-edit-custom]").forEach(b=>b.onclick=()=>{const o=state.customOptions.find(x=>x.id===b.dataset.editCustom);document.getElementById("editCustomOptionId").value=o.id;document.getElementById("customOptionName").value=o.name;document.getElementById("customOptionActive").checked=o.active;document.getElementById("customOptionFormTitle").textContent="Editar opção de montagem";});
  document.querySelectorAll("[data-toggle-custom]").forEach(b=>b.onclick=()=>{const o=state.customOptions.find(x=>x.id===b.dataset.toggleCustom);o.active=!o.active;saveState();toast(o.active?"Opção ativada.":"Opção inativada.");});
  document.querySelectorAll("[data-delete-custom]").forEach(b=>b.onclick=()=>{const o=state.customOptions.find(x=>x.id===b.dataset.deleteCustom);if(confirm(`Excluir a opção "${o.name}"?`)){state.customOptions=state.customOptions.filter(x=>x.id!==o.id);saveState();toast("Opção excluída.");}});
}

function renderAdminCreamOptions(){
  const list=document.getElementById("adminCreamOptionList");if(!list)return;
  list.innerHTML=state.creamOptions.map(o=>`<div class="admin-list-item ${o.active?"":"inactive"}"><div class="list-thumb">🍫</div><div class="list-main"><strong>${escapeHtml(o.name)}</strong><small>${o.active?"Ativo para o cliente":"Inativo"}</small></div><div class="list-actions"><button class="small-button" data-edit-cream="${o.id}">Editar</button><button class="small-button" data-toggle-cream="${o.id}">${o.active?"Inativar":"Ativar"}</button><button class="small-button danger" data-delete-cream="${o.id}">Excluir</button></div></div>`).join("")||'<p class="muted">Nenhum creme ou calda cadastrado.</p>';
  document.querySelectorAll("[data-edit-cream]").forEach(b=>b.onclick=()=>{const o=state.creamOptions.find(x=>x.id===b.dataset.editCream);document.getElementById("editCreamOptionId").value=o.id;document.getElementById("creamOptionName").value=o.name;document.getElementById("creamOptionActive").checked=o.active;document.getElementById("creamOptionFormTitle").textContent="Editar creme ou calda";});
  document.querySelectorAll("[data-toggle-cream]").forEach(b=>b.onclick=()=>{const o=state.creamOptions.find(x=>x.id===b.dataset.toggleCream);o.active=!o.active;saveState();toast(o.active?"Opção ativada.":"Opção inativada.");});
  document.querySelectorAll("[data-delete-cream]").forEach(b=>b.onclick=()=>{const o=state.creamOptions.find(x=>x.id===b.dataset.deleteCream);if(confirm(`Excluir a opção "${o.name}"?`)){state.creamOptions=state.creamOptions.filter(x=>x.id!==o.id);saveState();toast("Opção excluída.");}});
}
function resetCreamOptionForm(){document.getElementById("creamOptionForm").reset();document.getElementById("editCreamOptionId").value="";document.getElementById("creamOptionFormTitle").textContent="Adicionar creme ou calda";document.getElementById("creamOptionActive").checked=true;}

function renderPaymentOptions(){
  const el=document.getElementById("paymentOptions");if(!el)return;
  el.innerHTML=DEFAULT_PAYMENTS.map(p=>`<label class="check-option"><input type="checkbox" name="paymentChoice" value="${p}" ${state.payments.includes(p)?"checked":""}> ${p}</label>`).join("");
  const spoon=document.getElementById("spoonPrice");if(spoon)spoon.value=Number(state.spoonPrice||0).toFixed(2);
  const radius=document.getElementById("deliveryRadiusKm");if(radius)radius.value=Number(state.deliveryRadiusKm||10);
  for(let km=1;km<=10;km++){const input=document.getElementById(`deliveryPrice${km}`);if(input)input.value=Number(state.deliveryPrices?.[km-1]??0).toFixed(2);}
  const lat=document.getElementById("storeLatitude");if(lat)lat.value=Number(state.storeLatitude??seed.storeLatitude);
  const lon=document.getElementById("storeLongitude");if(lon)lon.value=Number(state.storeLongitude??seed.storeLongitude);
  const accompLimit=document.getElementById("accompanimentLimit");if(accompLimit)accompLimit.value=state.accompanimentLimit;
  const creamLimit=document.getElementById("creamLimit");if(creamLimit)creamLimit.value=state.creamLimit;
  const cupSizes=document.getElementById("cupSizesInput");if(cupSizes)cupSizes.value=(state.cupSizes||seed.cupSizes).join(", ");
}
function switchTab(id){
  document.querySelectorAll(".admin-tab-content").forEach(x=>x.classList.add("hidden"));document.getElementById(id).classList.remove("hidden");
  if(id==="ordersTab")loadAdminOrders("today");
  document.querySelectorAll(".tab-button").forEach(b=>b.classList.toggle("active",b.dataset.tab===id));
}

document.getElementById("backToMenu").onclick=showHome;
document.getElementById("backFromCheckout").onclick=showHome;
document.getElementById("openCart").onclick=openCheckout;
document.getElementById("openCartTop").onclick=openCheckout;
document.getElementById("checkoutButton").onclick=openCheckout;
document.getElementById("customerForm").addEventListener("submit",submitOrder);
document.getElementById("useMyLocation").addEventListener("click",useBrowserLocation);
document.getElementById("checkTypedAddress").addEventListener("click",checkTypedAddress);
document.getElementById("customerAddress").addEventListener("input",()=>{deliveryCheck=null;setDeliveryStatus("O endereço foi alterado. Faça a verificação novamente.","pending");updateDeliverySubmitState();updateDeliveryPriceUI();});
document.getElementById("openAdmin").onclick=openLogin;
document.querySelectorAll("[data-close]").forEach(b=>b.onclick=()=>document.getElementById(b.dataset.close).classList.add("hidden"));
document.getElementById("togglePassword").onclick=()=>{const i=document.getElementById("adminPassword");i.type=i.type==="password"?"text":"password";document.getElementById("togglePassword").textContent=i.type==="password"?"Mostrar":"Ocultar";};
document.getElementById("loginForm").onsubmit=async e=>{e.preventDefault();const error=document.getElementById("loginError");error.classList.add("hidden");if(!supabaseClient){error.textContent="A conexão com o Supabase não foi inicializada. Atualize a página e tente novamente.";error.classList.remove("hidden");return;}const email=document.getElementById("adminEmail").value.trim(),password=document.getElementById("adminPassword").value;const {data,error:authError}=await supabaseClient.auth.signInWithPassword({email,password});if(authError){console.error(authError);error.textContent="E-mail ou senha inválidos, ou usuário ainda não cadastrado no Supabase.";error.classList.remove("hidden");return;}cloudSession=data.session;updateCloudAdminUI();await refreshCloudState();enterAdmin();};
document.getElementById("publishCloudState").onclick=publishInitialCloudState;
document.getElementById("cloudAdminLogout").onclick=async()=>{if(supabaseClient)await supabaseClient.auth.signOut();cloudSession=null;updateCloudAdminUI();setCloudStatus("Conta administrativa desconectada.","Desconectado");};
document.getElementById("closeAdmin").onclick=exitAdmin;
document.getElementById("refreshOrders").onclick=()=>loadAdminOrders();
document.getElementById("todayOrdersButton").onclick=()=>loadAdminOrders("today");
document.getElementById("allOrdersButton").onclick=()=>loadAdminOrders("all");
document.querySelectorAll(".tab-button").forEach(b=>b.onclick=()=>switchTab(b.dataset.tab));
document.getElementById("resetProductForm").onclick=resetProductForm;
document.getElementById("addCategoryButton").onclick=addCategory;
document.getElementById("newCategoryName").addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();addCategory();}});
document.getElementById("productType").addEventListener("change",updateProductTypeFields);
document.getElementById("productUseSizes").addEventListener("change",updateProductTypeFields);
document.getElementById("productImage").onchange=async e=>{
  const file=e.target.files[0];if(!file)return;
  if(!file.type.startsWith("image/")){toast("Selecione um arquivo de imagem válido.");e.target.value="";return;}
  if(file.size>8*1024*1024){toast("Escolha uma imagem de até 8 MB.");e.target.value="";return;}
  try {
    const dataUrl=await new Promise((resolve,reject)=>{
      const reader=new FileReader();
      reader.onerror=()=>reject(new Error("Não foi possível ler a imagem."));
      reader.onload=()=>{
        const img=new Image();
        img.onerror=()=>reject(new Error("Imagem inválida."));
        img.onload=()=>{
          const max=1000, scale=Math.min(1,max/Math.max(img.width,img.height));
          const canvas=document.createElement("canvas");
          canvas.width=Math.max(1,Math.round(img.width*scale));
          canvas.height=Math.max(1,Math.round(img.height*scale));
          canvas.getContext("2d").drawImage(img,0,0,canvas.width,canvas.height);
          resolve(canvas.toDataURL("image/jpeg",0.78));
        };
        img.src=reader.result;
      };
      reader.readAsDataURL(file);
    });
    selectedImageData=dataUrl;
    document.getElementById("imagePreview").innerHTML=`<img src="${selectedImageData}" alt="Prévia">`;
  } catch(error) {
    console.error(error);toast("Não foi possível carregar essa imagem. Tente outra.");e.target.value="";
  }
};
document.getElementById("productForm").onsubmit=e=>{
  e.preventDefault();
  const form=e.currentTarget;
  if(!form.reportValidity())return;
  const id=document.getElementById("editProductId").value;
  const categories=[...document.querySelectorAll('[name="categoryChoice"]:checked')].map(c=>c.value);
  if(!categories.length){toast("Selecione pelo menos uma categoria para o produto.");return;}
  if(type==="custom"&&document.getElementById("productUseSizes").checked&&!selectedProductSizes().length){toast("Selecione pelo menos um tamanho para este produto.");return;}
  const accompaniments=[...document.querySelectorAll('[name="accompChoice"]:checked')].map(c=>c.value);
  const type=document.getElementById("productType").value;
  const data={id:id||uid(),name:document.getElementById("productName").value.trim(),description:document.getElementById("productDescription").value.trim(),price:Number(document.getElementById("productPrice").value),type,categories,active:document.getElementById("productActive").checked,image:selectedImageData,accompaniments,maxAccompaniments:type==="custom"?Math.max(0,Number(document.getElementById("productAccompanimentLimit").value||0)):0,maxCreams:type==="custom"?Math.max(0,Number(document.getElementById("productCreamLimit").value||0)):0,useSizes:type==="custom"&&document.getElementById("productUseSizes").checked,availableSizes:type==="custom"&&document.getElementById("productUseSizes").checked?selectedProductSizes():[],sizePrices:type==="custom"&&document.getElementById("productUseSizes").checked?Object.fromEntries([...document.querySelectorAll(".product-size-price")].map(input=>[input.dataset.size,Math.max(0,Number(input.value||0))])):{}};
  const previousIndex=id?state.products.findIndex(p=>p.id===id):-1;
  const previousProduct=previousIndex>=0?state.products[previousIndex]:null;
  if(id){if(previousIndex<0){toast("Não foi possível localizar o produto para edição.");return;}state.products[previousIndex]=data;}else state.products.push(data);
  if(!saveState()){
    if(id)state.products[previousIndex]=previousProduct;else state.products.pop();
    renderAll();
    return;
  }
  resetProductForm();toast("Produto salvo com sucesso!");
};
document.getElementById("resetAddonForm").onclick=()=>{document.getElementById("addonForm").reset();document.getElementById("editAddonId").value="";document.getElementById("addonFormTitle").textContent="Adicionar adicional";document.getElementById("addonActive").checked=true;};
document.getElementById("addonForm").onsubmit=e=>{
  e.preventDefault();const id=document.getElementById("editAddonId").value;const data={id:id||uid(),name:document.getElementById("addonName").value.trim(),price:Number(document.getElementById("addonPrice").value),active:document.getElementById("addonActive").checked};
  if(id){const i=state.addons.findIndex(a=>a.id===id);state.addons[i]=data;}else state.addons.push(data);
  saveState();document.getElementById("resetAddonForm").click();toast("Adicional salvo com sucesso!");
};
document.getElementById("saveSettings").onclick=()=>{state.payments=[...document.querySelectorAll('[name="paymentChoice"]:checked')].map(c=>c.value);if(!state.payments.length){toast("Selecione pelo menos uma forma de pagamento.");return;}const sizes=document.getElementById("cupSizesInput").value.split(",").map(x=>x.trim()).filter(Boolean);if(!sizes.length){toast("Cadastre pelo menos um tamanho de copo.");return;}const radius=Number(document.getElementById("deliveryRadiusKm").value);const lat=Number(document.getElementById("storeLatitude").value);const lon=Number(document.getElementById("storeLongitude").value);const deliveryPrices=Array.from({length:10},(_,i)=>Number(document.getElementById(`deliveryPrice${i+1}`).value));if(!Number.isFinite(radius)||radius<=0||radius>10||!Number.isFinite(lat)||lat< -90||lat>90||!Number.isFinite(lon)||lon< -180||lon>180||deliveryPrices.some(v=>!Number.isFinite(v)||v<0)){toast("Confira o raio (máximo 10 km), as coordenadas e os valores de entrega por KM.");return;}state.cupSizes=[...new Set(sizes)];state.spoonPrice=Math.max(0,Number(document.getElementById("spoonPrice").value||0));state.deliveryRadiusKm=radius;state.deliveryPrices=deliveryPrices;state.storeLatitude=lat;state.storeLongitude=lon;saveState();toast("Configurações atualizadas.");};
document.getElementById("resetCustomOptionForm").onclick=resetCustomOptionForm;
document.getElementById("creamOptionForm").onsubmit=e=>{e.preventDefault();const id=document.getElementById("editCreamOptionId").value;const data={id:id||uid(),name:document.getElementById("creamOptionName").value.trim(),active:document.getElementById("creamOptionActive").checked};if(id){const i=state.creamOptions.findIndex(o=>o.id===id);state.creamOptions[i]=data;}else state.creamOptions.push(data);saveState();resetCreamOptionForm();toast("Creme ou calda salvo.");};
document.getElementById("resetCreamOptionForm").onclick=resetCreamOptionForm;
document.getElementById("customOptionForm").onsubmit=e=>{e.preventDefault();const id=document.getElementById("editCustomOptionId").value;const data={id:id||uid(),name:document.getElementById("customOptionName").value.trim(),active:document.getElementById("customOptionActive").checked};if(id){const i=state.customOptions.findIndex(o=>o.id===id);state.customOptions[i]=data;}else state.customOptions.push(data);saveState();resetCustomOptionForm();toast("Opção de montagem salva.");};
renderProductFormChoices();
renderAll();
initCloud().catch(error=>{console.error("Falha ao iniciar Supabase:",error);setCloudStatus("Erro ao iniciar a sincronização. Confira a configuração.","Erro");});
