import { initializeApp } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-app.js";
import { getFirestore, collection, onSnapshot, query, orderBy, doc, updateDoc, deleteDoc, setDoc, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyC7uuy0yYV3L17RJ0RvbN-mrfqrT4PquMo",
    authDomain: "devi-sri-delights.firebaseapp.com",
    projectId: "devi-sri-delights"
};
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

window.allOrders = [];
window.allMenuCategories = [];
window.allUsers = [];
window.currentEditingCardId = null;
window.currentEditingCardData = null;
let initializedListeners = false;

// --- ADMIN AUTHENTICATION ---
window.adminLogin = async function() {
    const email = document.getElementById('admin-email').value.trim();
    const password = document.getElementById('admin-password').value.trim();
    if (!email || !password) return showCustomAlert("Please enter both email and password.", "error");
    
    try {
        await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
        showCustomAlert("Login Failed. Please check your credentials.", "error");
    }
};

window.adminLogout = async function() {
    showCustomConfirm("Are you sure you want to log out?", async () => {
        await signOut(auth);
    });
};

onAuthStateChanged(auth, (user) => {
    if (user) {
        document.getElementById('admin-login-overlay').style.display = 'none';
        if (!initializedListeners) {
            listenForStoreStatus(); listenForOrders(); listenForMenu(); listenForUsers();
            initializedListeners = true;
        }
    } else {
        document.getElementById('admin-login-overlay').style.display = 'flex';
        document.getElementById('admin-email').value = "";
        document.getElementById('admin-password').value = "";
    }
});


window.switchTab = function(tabId) {
    document.querySelectorAll('.admin-section').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    document.getElementById(tabId + '-section').classList.add('active');
    event.target.classList.add('active');
};

// --- CUSTOM ALERT & CONFIRM SYSTEM ---
const alertSoundInfo = new Audio("https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3");
const alertSoundError = new Audio("https://assets.mixkit.co/active_storage/sfx/2997/2997-preview.mp3");

window.showCustomAlert = function(message, type = 'info') {
    const modal = document.getElementById('custom-alert-modal');
    const iconElement = document.getElementById('custom-alert-icon');
    const titleElement = document.getElementById('custom-alert-title');
    document.getElementById('custom-alert-message').innerHTML = message;

    if (type === 'error') {
        iconElement.innerHTML = "⚠️"; titleElement.innerHTML = "Oops!"; titleElement.style.color = "#E11D48"; 
        alertSoundError.currentTime = 0; alertSoundError.play().catch(e => console.log("Blocked"));
    } else if (type === 'success') {
        iconElement.innerHTML = "✅"; titleElement.innerHTML = "Success!"; titleElement.style.color = "#10B981"; 
        alertSoundInfo.currentTime = 0; alertSoundInfo.play().catch(e => console.log("Blocked"));
    } else {
        iconElement.innerHTML = "🔔"; titleElement.innerHTML = "Notice"; titleElement.style.color = "var(--primary)"; 
        alertSoundInfo.currentTime = 0; alertSoundInfo.play().catch(e => console.log("Blocked"));
    }
    modal.classList.add('show');
};

window.confirmCallback = null;
window.showCustomConfirm = function(message, callback) {
    document.getElementById('custom-confirm-message').innerHTML = message;
    window.confirmCallback = callback;
    document.getElementById('custom-confirm-modal').classList.add('show');
    alertSoundError.currentTime = 0; alertSoundError.play().catch(e => console.log("Blocked"));
};
window.closeConfirmModal = function() { document.getElementById('custom-confirm-modal').classList.remove('show'); window.confirmCallback = null; };
window.executeConfirm = function() { if(window.confirmCallback) window.confirmCallback(); closeConfirmModal(); };

// --- STORE OPEN/CLOSE ---
function listenForStoreStatus() {
    onSnapshot(doc(db, "settings", "store"), (docSnap) => {
        if (!docSnap.exists()) { setDoc(doc(db, "settings", "store"), { isOpen: true }); return; }
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

// --- BROADCAST MESSAGES ---
window.sendBroadcast = async function() {
    let msg = document.getElementById('broadcast-msg').value.trim();
    if (!msg) return showCustomAlert("Please type a message first.", "error");
    showCustomConfirm("Send this alert to all active customers immediately?", async () => {
        await addDoc(collection(db, "broadcasts"), { message: msg, timestamp: serverTimestamp() });
        document.getElementById('broadcast-msg').value = ""; 
        showCustomAlert("Broadcast Sent Successfully! 🚀", "success");
    });
};

// --- KANBAN ORDERS DASHBOARD ---
function listenForOrders() {
    const q = query(collection(db, "orders"), orderBy("timestamp", "desc"));
    let isFirstLoad = true;
    onSnapshot(q, (snapshot) => {
        window.allOrders = [];
        snapshot.forEach(doc => window.allOrders.push({ id: doc.id, ...doc.data() }));
        if (!isFirstLoad && snapshot.docChanges().some(change => change.type === "added")) document.getElementById('kitchen-bell').play().catch(e=>console.log("Blocked"));
        isFirstLoad = false; calculateTodayMetrics(); renderOrders();
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

    document.getElementById('metric-orders').innerText = todayCount; document.getElementById('metric-earnings').innerText = "₹" + todayEarnings;
    let itemsHtml = ""; for (let item in itemSummary) itemsHtml += `<span class="item-tag">${item} x${itemSummary[item]}</span>`;
    document.getElementById('metric-items').innerHTML = itemsHtml || '<p style="color: #64748B;">No items sold today.</p>';
}

window.renderOrders = function() {
    const searchTerm = document.getElementById('search-order').value.toLowerCase();
    const listPending = document.getElementById('orders-pending'); listPending.innerHTML = '';
    const listReady = document.getElementById('orders-ready'); listReady.innerHTML = '';
    const listCompleted = document.getElementById('orders-completed'); listCompleted.innerHTML = '';

    let counts = { pending: 0, ready: 0, completed: 0 };

    window.allOrders.forEach(order => {
        if (searchTerm && !(order.customerName && order.customerName.toLowerCase().includes(searchTerm))) return;

        let timeStr = order.timestamp ? new Date(order.timestamp.toMillis()).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 'Just now';
        let itemsHtml = ""; let whatsappItemsText = "";
        
        for(let itemName in order.orderItems) { 
            let item = order.orderItems[itemName]; 
            itemsHtml += `<div><span>${item.quantity}x ${itemName}</span><span>₹${item.price * item.quantity}</span></div>`; 
            whatsappItemsText += `• ${itemName} (x${item.quantity})\n`;
        }

        let phoneForWa = order.customerPhone || ""; if (phoneForWa.startsWith("+")) phoneForWa = phoneForWa.substring(1);
        let detailedMsgRaw = `🎉 *Your Order is Ready!*\n\nHello ${order.customerName},\nYour food from *Devi Sri Delights* is hot and ready for pickup!\n\n*Order Details:*\n${whatsappItemsText}\n*Total Bill:* ₹${order.totalBill}\n\nPlease collect it at the counter. See you soon! 😋`;
        let waLink = `https://wa.me/${phoneForWa}?text=${encodeURIComponent(detailedMsgRaw)}`;

        let card = document.createElement('div'); card.className = "order-card";
        let actionButtons = `<div class="order-actions">`;

        if (order.status === "Pending" || !order.status) {
            counts.pending++;
            actionButtons += `<button class="btn-action btn-success" style="flex: 2;" onclick="markReady('${order.id}', '${waLink}')">Ready & Notify</button>`;
            if (phoneForWa) actionButtons += `<a href="tel:+91${phoneForWa}" class="btn-action btn-blue">Call</a>`;
            actionButtons += `<button class="btn-action btn-danger" onclick="cancelOrder('${order.id}')">Cancel</button>`;
            
            card.innerHTML = `<span class="order-time">🕒 ${timeStr}</span><h3 class="order-name">${order.customerName}</h3><p class="order-phone">📞 ${order.customerPhone || 'No Phone'}</p><div class="order-items">${itemsHtml}</div><div class="order-total">Total: ₹${order.totalBill}</div>${actionButtons}</div>`;
            listPending.appendChild(card);
            
        } else if (order.status === "Ready") {
            counts.ready++; card.classList.add('ready');
            actionButtons += `<button class="btn-action btn-primary" style="flex: 2;" onclick="markPickedUp('${order.id}')">Confirm Picked Up</button>`;
            if (phoneForWa) actionButtons += `<a href="tel:+91${phoneForWa}" class="btn-action btn-blue">Call</a>`;
            
            card.innerHTML = `<span class="order-time">🕒 ${timeStr}</span><h3 class="order-name">${order.customerName}</h3><p class="order-phone">📞 ${order.customerPhone || 'No Phone'}</p><div class="order-items">${itemsHtml}</div><div class="order-total">Total: ₹${order.totalBill}</div>${actionButtons}</div>`;
            listReady.appendChild(card);
            
        } else {
            counts.completed++; 
            if(order.status === "Cancelled") card.classList.add('cancelled'); else card.classList.add('completed');
            actionButtons += `<button class="btn-action btn-disabled" style="flex: 2;">${order.status || 'Completed'}</button>`;
            actionButtons += `<button class="btn-action btn-danger" onclick="deleteOrder('${order.id}')">Delete</button>`;
            
            card.innerHTML = `<span class="order-time">🕒 ${timeStr}</span><h3 class="order-name">${order.customerName}</h3><p class="order-phone">📞 ${order.customerPhone || 'No Phone'}</p><div class="order-items">${itemsHtml}</div><div class="order-total">Total: ₹${order.totalBill}</div>${actionButtons}</div>`;
            listCompleted.appendChild(card);
        }
    });

    document.getElementById('count-pending').innerText = counts.pending;
    document.getElementById('count-ready').innerText = counts.ready;
    document.getElementById('count-completed').innerText = counts.completed;
};

window.markReady = async function(orderId, waLink) {
    await updateDoc(doc(db, "orders", orderId), { status: "Ready" });
    if(waLink && !waLink.includes('No Phone')) window.open(waLink, '_blank');
};

window.markPickedUp = async function(orderId) { 
    await updateDoc(doc(db, "orders", orderId), { status: "Completed" }); 
};

window.cancelOrder = async function(orderId) {
    showCustomConfirm("Cancel this order? This cannot be undone.", async () => {
        await updateDoc(doc(db, "orders", orderId), { status: "Cancelled" });
        showCustomAlert("Order Cancelled", "info");
    });
};

window.deleteOrder = async function(orderId) {
    showCustomConfirm("Permanently delete this order record? It will be removed completely.", async () => {
        await deleteDoc(doc(db, "orders", orderId));
        showCustomAlert("Order Deleted", "success");
    });
};

// --- MENU MANAGEMENT ---
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
    const name = document.getElementById('card-name').value; if (!name) return showCustomAlert("Category Name required.", "error");
    const cardData = { name, image: document.getElementById('card-image').value, type: document.getElementById('card-type').value, order: parseInt(document.getElementById('card-order').value) || 99 };
    if (window.currentEditingCardId) await updateDoc(doc(db, "menu", window.currentEditingCardId), cardData);
    else { cardData.items = []; await addDoc(collection(db, "menu"), cardData); }
    closeModal('card-modal');
    showCustomAlert("Category Saved!", "success");
};

window.deleteCard = async function() { 
    showCustomConfirm("Delete this entire category and all its items?", async () => { 
        await deleteDoc(doc(db, "menu", window.currentEditingCardId)); closeModal('card-modal'); 
        showCustomAlert("Category Deleted.", "info");
    }); 
};

function renderCardItemsList() {
    const list = document.getElementById('current-items-list'); list.innerHTML = "";
    let items = window.currentEditingCardData.items || [];
    if (items.length === 0) return list.innerHTML = "<p style='color: var(--text-light); font-size: 0.9rem;'>No items added yet.</p>";

    items.forEach((item, index) => {
        let inStock = item.inStock !== false;
        let stockBtn = inStock ? `<button class="btn-stock in-stock" onclick="toggleStock(${index})">In Stock</button>` : `<button class="btn-stock out-of-stock" onclick="toggleStock(${index})">Sold Out</button>`;
        
        let displayImg = item.images && item.images.length > 0 ? item.images[0] : (item.image ? item.image : '');
        let imgTag = displayImg ? `<img src="${displayImg}" style="width: 40px; height: 40px; border-radius: 4px; object-fit: cover; margin-right: 10px;">` : '';
        
        list.innerHTML += `<div class="existing-item-row"><div style="display: flex; align-items: center;">${imgTag}<div><strong style="display:block;">${item.name}</strong><span style="color: var(--primary); font-size: 0.85rem; font-weight: bold;">₹${item.price}</span></div></div><div style="display:flex; gap: 10px; align-items: center;">${stockBtn}<button onclick="deleteItemFromCard(${index})" style="background: none; border: none; color: red; font-size: 1.2rem; cursor: pointer;">🗑️</button></div></div>`;
    });
}

window.toggleStock = async function(index) {
    let items = window.currentEditingCardData.items; items[index].inStock = items[index].inStock === false ? true : false;
    await updateDoc(doc(db, "menu", window.currentEditingCardId), { items: items }); renderCardItemsList();
};

window.addNewItemToCard = async function() {
    const itemName = document.getElementById('new-item-name').value.trim(); const itemPrice = parseInt(document.getElementById('new-item-price').value);
    if (!itemName || isNaN(itemPrice)) return showCustomAlert("Item name and price required.", "error");
    
    let items = window.currentEditingCardData.items || []; 
    let newItem = { name: itemName, price: itemPrice, inStock: true };
    
    let imgString = document.getElementById('new-item-image').value.trim();
    if(imgString) {
        let imagesArray = imgString.split(',').map(url => url.trim()).filter(url => url !== "");
        newItem.images = imagesArray;
    }
    
    items.push(newItem);
    await updateDoc(doc(db, "menu", window.currentEditingCardId), { items: items });
    
    document.getElementById('new-item-name').value = ""; document.getElementById('new-item-price').value = ""; document.getElementById('new-item-image').value = "";
    renderCardItemsList();
};

window.deleteItemFromCard = async function(index) {
    showCustomConfirm("Delete this item?", async () => { 
        let items = window.currentEditingCardData.items; items.splice(index, 1); 
        await updateDoc(doc(db, "menu", window.currentEditingCardId), { items: items }); 
        renderCardItemsList(); 
    });
};

// --- USER MANAGEMENT LOGIC ---
function listenForUsers() {
    onSnapshot(collection(db, "users"), (snapshot) => {
        window.allUsers = []; snapshot.forEach(doc => window.allUsers.push({ id: doc.id, ...doc.data() })); renderUsers();
    });
}

window.renderUsers = function() {
    const searchTerm = document.getElementById('search-user').value.toLowerCase();
    const grid = document.getElementById('users-grid'); grid.innerHTML = '';
    
    const filteredUsers = window.allUsers.filter(u => {
        let nameMatch = u.name && u.name.toLowerCase().includes(searchTerm);
        let emailMatch = u.email && u.email.toLowerCase().includes(searchTerm);
        let phoneMatch = u.phoneNumber && u.phoneNumber.includes(searchTerm);
        return nameMatch || emailMatch || phoneMatch;
    });

    if (filteredUsers.length === 0) return grid.innerHTML = '<p style="color: #64748B; width: 100%;">No users match your search.</p>';

    filteredUsers.forEach(user => {
        let card = document.createElement('div'); card.className = "user-admin-card";
        let photo = user.photoURL || 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png';
        let claimed = user.claimedDesserts || 0;
        card.innerHTML = `
            <div style="display: flex; gap: 15px; align-items: center;">
                <img src="${photo}" style="width: 60px; height: 60px; border-radius: 50%; object-fit: cover; border: 2px solid var(--border);">
                <div style="flex: 1; overflow: hidden;">
                    <h3 style="margin: 0 0 5px 0; color: var(--text-dark);">${user.name || "Guest User"}</h3>
                    <p style="margin: 0; font-size: 0.85rem; color: var(--text-light); text-overflow: ellipsis; overflow: hidden;">📧 ${user.email || "No email"}</p>
                    <p style="margin: 0; font-size: 0.85rem; color: var(--text-light);">📞 ${user.phoneNumber || "No phone"}</p>
                </div>
            </div>
            <div style="margin-top: 15px; padding-top: 15px; border-top: 1px dashed var(--border); display: flex; justify-content: space-between; align-items: center;">
                <span style="font-size: 0.85rem; font-weight: bold; color: var(--primary);">Claimed Rewards: ${claimed}</span>
                <button class="btn-stock in-stock" onclick="openUserModal('${user.id}')">Edit User</button>
            </div>
        `;
        grid.appendChild(card);
    });
};

window.openUserModal = function(userId) {
    let user = window.allUsers.find(u => u.id === userId); if (!user) return;
    document.getElementById('edit-user-id').value = user.id;
    document.getElementById('edit-user-name').value = user.name || "";
    document.getElementById('edit-user-email').value = user.email || "";
    document.getElementById('edit-user-phone').value = user.phoneNumber || "";
    document.getElementById('edit-user-photo').value = user.photoURL || "";
    document.getElementById('user-modal').classList.add('show');
};

window.saveUserEdit = async function() {
    let uid = document.getElementById('edit-user-id').value;
    let updateData = {
        name: document.getElementById('edit-user-name').value,
        email: document.getElementById('edit-user-email').value,
        phoneNumber: document.getElementById('edit-user-phone').value,
        photoURL: document.getElementById('edit-user-photo').value
    };
    await updateDoc(doc(db, "users", uid), updateData);
    closeModal('user-modal'); showCustomAlert("User details updated successfully!", "success");
};

// --- REWARDS SCANNER LOGIC ---
let scannedRewardData = null;

window.handleQRScan = function(e) {
    if (e.key === 'Enter') {
        let inputVal = document.getElementById('qr-scanner-input').value;
        document.getElementById('qr-scanner-input').value = ""; 
        try {
            let data = JSON.parse(decodeURIComponent(inputVal));
            if(data.uid && data.email) {
                let userDoc = window.allUsers.find(u => u.id === data.uid);
                let previouslyClaimed = userDoc && userDoc.claimedDesserts ? userDoc.claimedDesserts : 0;
                let actualAvailable = data.rewardsToClaim - previouslyClaimed;

                document.getElementById('reward-name').innerText = data.name;
                document.getElementById('reward-email').innerText = data.email;
                document.getElementById('reward-available').innerText = actualAvailable;
                
                scannedRewardData = { uid: data.uid, actualAvailable: actualAvailable };
                document.getElementById('reward-result-card').style.display = 'block';

                if(actualAvailable <= 0) {
                    document.getElementById('claim-btn').disabled = true;
                    document.getElementById('claim-btn').style.background = "#E2E8F0";
                    document.getElementById('claim-btn').innerText = "No Rewards Available";
                    showCustomAlert("This customer has already claimed all their available rewards.", "error");
                } else {
                    document.getElementById('claim-btn').disabled = false;
                    document.getElementById('claim-btn').style.background = "var(--primary)";
                    document.getElementById('claim-btn').innerText = "Mark 1 Dessert as Claimed";
                }
            }
        } catch(err) {
            showCustomAlert("Invalid QR Code Data. Please scan a valid Devi Sri reward code.", "error");
            document.getElementById('reward-result-card').style.display = 'none';
        }
    }
};

window.executeClaim = async function() {
    if(!scannedRewardData || scannedRewardData.actualAvailable <= 0) return;
    
    showCustomConfirm("Confirm claiming 1 free dessert for this customer?", async () => {
        let userDoc = window.allUsers.find(u => u.id === scannedRewardData.uid);
        let newClaimCount = (userDoc && userDoc.claimedDesserts ? userDoc.claimedDesserts : 0) + 1;
        
        await updateDoc(doc(db, "users", scannedRewardData.uid), { claimedDesserts: newClaimCount }, { merge: true });
        
        document.getElementById('reward-result-card').style.display = 'none';
        scannedRewardData = null;
        showCustomAlert("Reward Successfully Claimed! 🍦", "success");
    });
};
