import { initializeApp } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-app.js";
import { getFirestore, collection, onSnapshot, query, orderBy, doc, updateDoc, deleteDoc, setDoc, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyC7uuy0yYV3L17RJ0RvbN-mrfqrT4PquMo",
    authDomain: "devi-sri-delights.firebaseapp.com",
    projectId: "devi-sri-delights"
};
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

window.allOrders = [];
window.allMenuCategories = [];
window.currentEditingCardId = null;
window.currentEditingCardData = null;
let initialLoad = true;

window.switchTab = function(tabId) {
    document.querySelectorAll('.admin-section').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    document.getElementById(tabId + '-section').classList.add('active');
    event.target.classList.add('active');
};

// --- FEATURE: STORE OPEN/CLOSE ---
function listenForStoreStatus() {
    onSnapshot(doc(db, "settings", "store"), (docSnap) => {
        if (!docSnap.exists()) {
            setDoc(doc(db, "settings", "store"), { isOpen: true });
            return;
        }
        let isOpen = docSnap.data().isOpen;
        document.getElementById('store-toggle').checked = isOpen;
        document.getElementById('store-status-text').innerText = isOpen ? "Store Open" : "Store Closed";
        document.getElementById('store-status-text').style.color = isOpen ? "var(--success)" : "var(--danger)";
    });
}

window.toggleStoreOpen = async function() {
    let isOpen = document.getElementById('store-toggle').checked;
    await setDoc(doc(db, "settings", "store"), { isOpen: isOpen }, { merge: true });
};

// --- FEATURE: BROADCAST MESSAGES ---
window.sendBroadcast = async function() {
    let msg = document.getElementById('broadcast-msg').value.trim();
    if (!msg) return alert("Please type a message first.");
    
    if(confirm("Send this alert to all active customers immediately?")) {
        await addDoc(collection(db, "broadcasts"), { message: msg, timestamp: serverTimestamp() });
        document.getElementById('broadcast-msg').value = "";
        alert("Broadcast Sent! 🚀");
    }
};

// --- LIVE ORDERS (Dashboard) ---
function listenForOrders() {
    const q = query(collection(db, "orders"), orderBy("timestamp", "desc"));
    onSnapshot(q, (snapshot) => {
        window.allOrders = [];
        snapshot.forEach(doc => window.allOrders.push({ id: doc.id, ...doc.data() }));
        if (!initialLoad && snapshot.docChanges().some(change => change.type === "added")) document.getElementById('kitchen-bell').play().catch(e=>console.log("Audio blocked"));
        initialLoad = false;
        calculateTodayMetrics(); renderOrders();
    });
}

function calculateTodayMetrics() {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    let todayCount = 0; let todayEarnings = 0; let itemSummary = {};

    window.allOrders.forEach(order => {
        let orderDate = order.timestamp ? new Date(order.timestamp.toMillis()) : new Date();
        if (orderDate >= today) {
            todayCount++; todayEarnings += order.totalBill || 0;
            if (order.orderItems) { for (let itemName in order.orderItems) { itemSummary[itemName] = (itemSummary[itemName] || 0) + order.orderItems[itemName].quantity; } }
        }
    });

    document.getElementById('metric-orders').innerText = todayCount;
    document.getElementById('metric-earnings').innerText = "₹" + todayEarnings;
    let itemsHtml = ""; for (let item in itemSummary) itemsHtml += `<span class="item-tag">${item} x${itemSummary[item]}</span>`;
    document.getElementById('metric-items').innerHTML = itemsHtml || '<p style="color: #64748B;">No items sold today.</p>';
}

window.renderOrders = function() {
    const searchTerm = document.getElementById('search-order').value.toLowerCase();
    const grid = document.getElementById('orders-grid'); grid.innerHTML = '';
    const filteredOrders = window.allOrders.filter(o => (o.customerName && o.customerName.toLowerCase().includes(searchTerm)) || (o.status !== "Completed" && o.status !== "Picked up"));

    if (filteredOrders.length === 0) return grid.innerHTML = '<p style="color: #64748B; width: 100%;">No active orders found.</p>';

    filteredOrders.forEach(order => {
        let timeStr = order.timestamp ? new Date(order.timestamp.toMillis()).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 'Just now';
        let itemsHtml = ""; for(let itemName in order.orderItems) { let item = order.orderItems[itemName]; itemsHtml += `<div><span>${item.quantity}x ${itemName}</span><span>₹${item.price * item.quantity}</span></div>`; }

        let statusClass = "pending"; let actionButton = "";
        let phoneForWa = order.customerPhone || ""; if (phoneForWa.startsWith("+")) phoneForWa = phoneForWa.substring(1);

        if (order.status === "Pending" || !order.status) {
            let msg = `Hello ${order.customerName}, your order for ₹${order.totalBill} is READY for pickup at Devi Sri Delights! 🎉`;
            let waLink = `https://wa.me/${phoneForWa}?text=${encodeURIComponent(msg)}`;
            actionButton = `<button class="btn-ready" onclick="markReady('${order.id}', '${waLink}')">Mark Ready & Notify</button>`;
        } else if (order.status === "Ready") {
            statusClass = "ready"; actionButton = `<button class="btn-picked" onclick="markPickedUp('${order.id}')">Confirm Picked Up</button>`;
        } else {
            statusClass = "completed"; actionButton = `<button class="btn-picked" style="background: #E2E8F0; color: #64748B; cursor: default;">Completed</button>`;
        }

        let card = document.createElement('div'); card.className = `order-card ${statusClass}`;
        card.innerHTML = `<span class="order-time">🕒 ${timeStr}</span><h3 class="order-name">${order.customerName}</h3><p class="order-phone">📞 ${order.customerPhone || 'No Phone'}</p><div class="order-items">${itemsHtml}</div><div class="order-total">Total: ₹${order.totalBill}</div>${actionButton}`;
        grid.appendChild(card);
    });
};

window.filterOrders = window.renderOrders;

window.markReady = async function(orderId, waLink) {
    await updateDoc(doc(db, "orders", orderId), { status: "Ready" });
    if(waLink && !waLink.includes('No Phone')) window.open(waLink, '_blank');
};

window.markPickedUp = async function(orderId) { await updateDoc(doc(db, "orders", orderId), { status: "Picked up" }); };

// --- MENU & STOCK LOGIC ---
function listenForMenu() {
    onSnapshot(collection(db, "menu"), (snapshot) => {
        window.allMenuCategories = []; snapshot.forEach(doc => window.allMenuCategories.push({ id: doc.id, ...doc.data() }));
        window.allMenuCategories.sort((a, b) => (a.order || 99) - (b.order || 99)); renderMenuAdmin();
    });
}

function renderMenuAdmin() {
    const grid = document.getElementById('menu-cards-grid'); grid.innerHTML = '';
    window.allMenuCategories.forEach(cat => {
        let card = document.createElement('div'); card.className = "menu-admin-card";
        let typeBadge = cat.type === 'minor' ? '<span class="badge">Minor (Half)</span>' : '<span class="badge major">Major (Full)</span>';
        card.innerHTML = `<img src="${cat.image || 'https://via.placeholder.com/300x120'}" alt="${cat.name}"><div class="menu-admin-info">${typeBadge}<h3>${cat.name}</h3><p style="font-size: 0.8rem; color: var(--text-light); margin-bottom: 15px;">Pos: ${cat.order || 0} • Items: ${cat.items ? cat.items.length : 0}</p><button class="btn-edit" onclick="openCardModal('${cat.id}')">Edit Category</button></div>`;
        grid.appendChild(card);
    });
}

window.openCardModal = function(cardId = null) {
    document.getElementById('card-modal').classList.add('show');
    if (cardId) {
        window.currentEditingCardId = cardId; window.currentEditingCardData = window.allMenuCategories.find(c => c.id === cardId);
        document.getElementById('card-modal-title').innerText = "Edit Category";
        document.getElementById('card-name').value = window.currentEditingCardData.name || "";
        document.getElementById('card-image').value = window.currentEditingCardData.image || "";
        document.getElementById('card-type').value = window.currentEditingCardData.type || "major";
        document.getElementById('card-order').value = window.currentEditingCardData.order || 0;
        document.getElementById('delete-card-btn').style.display = "block"; document.getElementById('card-items-manager').style.display = "block";
        renderCardItemsList();
    } else {
        window.currentEditingCardId = null; window.currentEditingCardData = { items: [] };
        document.getElementById('card-modal-title').innerText = "Add New Category";
        document.getElementById('card-name').value = ""; document.getElementById('card-image').value = ""; document.getElementById('card-type').value = "major"; document.getElementById('card-order').value = window.allMenuCategories.length + 1;
        document.getElementById('delete-card-btn').style.display = "none"; document.getElementById('card-items-manager').style.display = "none";
    }
};

window.closeModal = function(id) { document.getElementById(id).classList.remove('show'); };

window.saveCard = async function() {
    const name = document.getElementById('card-name').value;
    if (!name) return alert("Category Name required.");
    const cardData = { name, image: document.getElementById('card-image').value, type: document.getElementById('card-type').value, order: parseInt(document.getElementById('card-order').value) || 99 };
    if (window.currentEditingCardId) await updateDoc(doc(db, "menu", window.currentEditingCardId), cardData);
    else { cardData.items = []; await addDoc(collection(db, "menu"), cardData); }
    closeModal('card-modal');
};

window.deleteCard = async function() {
    if (confirm("Delete this entire category?")) { await deleteDoc(doc(db, "menu", window.currentEditingCardId)); closeModal('card-modal'); }
};

function renderCardItemsList() {
    const list = document.getElementById('current-items-list'); list.innerHTML = "";
    let items = window.currentEditingCardData.items || [];
    if (items.length === 0) return list.innerHTML = "<p style='color: var(--text-light); font-size: 0.9rem;'>No items added yet.</p>";

    items.forEach((item, index) => {
        let inStock = item.inStock !== false; // Default true
        let stockBtn = inStock ? `<button class="btn-stock in-stock" onclick="toggleStock(${index})">In Stock</button>` : `<button class="btn-stock out-of-stock" onclick="toggleStock(${index})">Sold Out</button>`;
        let imgTag = item.image ? `<img src="${item.image}" style="width: 40px; height: 40px; border-radius: 4px; object-fit: cover; margin-right: 10px;">` : '';
        
        list.innerHTML += `
            <div class="existing-item-row">
                <div style="display: flex; align-items: center;">${imgTag}<div><strong style="display:block;">${item.name}</strong><span style="color: var(--primary); font-size: 0.85rem; font-weight: bold;">₹${item.price}</span></div></div>
                <div style="display:flex; gap: 10px; align-items: center;">
                    ${stockBtn}
                    <button onclick="deleteItemFromCard(${index})" style="background: none; border: none; color: red; font-size: 1.2rem; cursor: pointer;">🗑️</button>
                </div>
            </div>`;
    });
}

// FEATURE: TOGGLE OUT OF STOCK
window.toggleStock = async function(index) {
    let items = window.currentEditingCardData.items;
    items[index].inStock = items[index].inStock === false ? true : false;
    await updateDoc(doc(db, "menu", window.currentEditingCardId), { items: items });
    renderCardItemsList();
};

window.addNewItemToCard = async function() {
    const itemName = document.getElementById('new-item-name').value.trim(); const itemPrice = parseInt(document.getElementById('new-item-price').value);
    if (!itemName || isNaN(itemPrice)) return alert("Item name and price required.");
    let items = window.currentEditingCardData.items || [];
    let newItem = { name: itemName, price: itemPrice, inStock: true };
    let img = document.getElementById('new-item-image').value.trim(); if(img) newItem.image = img;
    items.push(newItem);
    await updateDoc(doc(db, "menu", window.currentEditingCardId), { items: items });
    document.getElementById('new-item-name').value = ""; document.getElementById('new-item-price').value = ""; document.getElementById('new-item-image').value = "";
    renderCardItemsList();
};

window.deleteItemFromCard = async function(index) {
    if (confirm("Delete this item?")) {
        let items = window.currentEditingCardData.items; items.splice(index, 1);
        await updateDoc(doc(db, "menu", window.currentEditingCardId), { items: items }); renderCardItemsList();
    }
};

listenForStoreStatus(); listenForOrders(); listenForMenu();
