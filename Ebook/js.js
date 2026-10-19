// ==========================================
// ১. ইনিশিয়ালাইজেশন ও অথেন্টিকেশন চেক
// ==========================================
const jonImgUrl = "https://i.ibb.co.com/gF7Wm4ZS/Screenshot-20261019-120618.jpg";

const endpoint = "https://firestore.googleapis.com/v1/projects/tournament-2d6d4/databases/(default)/documents/books";
const apiKey = "?key=AIzaSyCNvnJsIn4-oKHLVv7-oNHCTskjE8";

const sessionData = localStorage.getItem('userSession');
if (!sessionData) {
    window.location.href = "loginebok.html";
}

let currentUser = JSON.parse(sessionData);

// নতুন ইউজারের ক্ষেত্রে ডায়মন্ড একদম ০ থেকে শুরু হবে
if (currentUser.diamonds === undefined) {
    currentUser.diamonds = 0;
    localStorage.setItem('userSession', JSON.stringify(currentUser));
}

// UI-তে ইউজার ও ডায়মন্ড আপডেট করার ফাংশন (ফিক্সড)
function updateUI() {
    const sidebarUserName = document.getElementById('sidebarUserName');
    const sidebarUserId = document.getElementById('sidebarUserId');
    const sidebarUserClass = document.getElementById('sidebarUserClass');
    if (sidebarUserName) sidebarUserName.textContent = currentUser.userName || "ইউজার";
    if (sidebarUserId) sidebarUserId.textContent = currentUser.userId || "------";
    if (sidebarUserClass) sidebarUserClass.textContent = currentUser.userClass || "---";

    const headerDiamondCount = document.getElementById('headerDiamondCount');
    if (headerDiamondCount) headerDiamondCount.textContent = currentUser.diamonds || 0;

    // ১. ব্র্যান্ড লোগোতে (বাম পাশে) সবসময় জনের ছবি থাকবে
    const logoPic = document.getElementById('jonLogoPic');
    if (logoPic) logoPic.src = jonImgUrl;

    // ২. ইউজার প্রোফাইল পিকচার লজিক (ডান পাশে):
    // ইউজার ছবি আপলোড করে থাকলে সেটি দেখাবে, আর না থাকলে বা প্লেসহোল্ডার থাকলে একটি নিউট্রাল ইউজার আইকন দেখাবে।
    const defaultUserAvatar = "https://cdn-icons-png.flaticon.com/512/149/149071.png"; // নিউট্রাল ইউজার আইকন
    
    let userAvatarUrl = defaultUserAvatar;
    if (currentUser.profilePic && 
        currentUser.profilePic.trim() !== "" && 
        !currentUser.profilePic.includes("placeholder.com") && 
        currentUser.profilePic !== jonImgUrl) {
        userAvatarUrl = currentUser.profilePic;
    }

    const sidebarUserAvatar = document.getElementById('sidebarUserAvatar');
    const headerUserAvatar = document.getElementById('headerUserAvatar');
    if (sidebarUserAvatar) sidebarUserAvatar.src = userAvatarUrl;
    if (headerUserAvatar) headerUserAvatar.src = userAvatarUrl;
}

updateUI();

// লগআউট ফাংশন
function logoutUser() {
    localStorage.removeItem('userSession');
    window.location.href = "loginebok.html";
}

// সাইডবার টগল ফাংশন
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    if (sidebar) sidebar.classList.toggle('active');
    if (overlay) overlay.classList.toggle('active');
}

// ==========================================
// ২. রিডিম কোড ও ডায়মন্ড সিস্টেম
// ==========================================
function openRedeemModal() {
    toggleSidebar();
    const modal = document.getElementById('redeemModal');
    if (modal) modal.style.display = 'flex';
}

function closeRedeemModal() {
    const modal = document.getElementById('redeemModal');
    if (modal) modal.style.display = 'none';
    document.getElementById('redeemCodeInput').value = '';
    document.getElementById('redeemMessage').textContent = '';
}

// রিডিম কোডের তালিকা ও ডায়মন্ড ভ্যালু
const validRedeemCodes = {
    "JON500": 500,
    "ADNAN100": 100,
    "DON2026": 250
};

function applyRedeemCode() {
    const codeInput = document.getElementById('redeemCodeInput').value.trim();
    const msgDiv = document.getElementById('redeemMessage');

    let usedCodes = JSON.parse(localStorage.getItem('usedRedeemCodes') || "[]");

    if (usedCodes.includes(codeInput)) {
        msgDiv.style.color = "#ef4444";
        msgDiv.textContent = "এই কোডটি ইতিমধ্যে ব্যবহার করা হয়েছে!";
        return;
    }

    if (validRedeemCodes[codeInput] !== undefined) {
        const addedDiamonds = validRedeemCodes[codeInput];
        currentUser.diamonds += addedDiamonds;
        localStorage.setItem('userSession', JSON.stringify(currentUser));
        
        usedCodes.push(codeInput);
        localStorage.setItem('usedRedeemCodes', JSON.stringify(usedCodes));

        updateUI();

        msgDiv.style.color = "#10b981";
        msgDiv.textContent = `সফল! আপনি ${addedDiamonds} ডায়মন্ড পেয়েছেন।`;
        
        setTimeout(() => {
            closeRedeemModal();
        }, 1500);
    } else {
        msgDiv.style.color = "#ef4444";
        msgDiv.textContent = "ভুল কোড! সঠিক কোড দিন।";
    }
}

// ==========================================
// ৩. ফায়ারবেস থেকে বই ফেচ ও রেন্ডার করা
// ==========================================
let allBooksData = [];

async function fetchBooks() {
    const booksContainer = document.getElementById('booksContainer');
    if (!booksContainer) return;

    try {
        const response = await fetch(endpoint + apiKey);
        const data = await response.json();
        booksContainer.innerHTML = '';

        if (data.documents) {
            const userClassLower = currentUser.userClass ? currentUser.userClass.trim().toLowerCase() : "";

            allBooksData = data.documents.filter(doc => {
                const fields = doc.fields;
                const bookClass = fields.Class && fields.Class.stringValue ? fields.Class.stringValue.trim().toLowerCase() : "";
                return bookClass === userClassLower;
            });

            if (allBooksData.length > 0) {
                allBooksData.forEach((doc, index) => {
                    const fields = doc.fields;
                    const bookName = fields.B_n ? fields.B_n.stringValue : 'অজানা বই';
                    const coverLink = fields.B_c_i_link ? fields.B_c_i_link.stringValue : 'https://via.placeholder.com/150x200';

                    const bookCard = document.createElement('div');
                    bookCard.className = 'book-card';
                    bookCard.onclick = () => openModal(index);
                    bookCard.innerHTML = `
                        <div class="book-cover-container">
                            <img src="${coverLink}" alt="${bookName}" class="book-cover">
                        </div>
                        <div class="book-title">${bookName}</div>
                    `;
                    booksContainer.appendChild(bookCard);
                });

                // গ্রিড ঠিক রাখতে খালি স্লট পূরণ
                const totalSlots = 6;
                const emptySlotsNeeded = totalSlots - allBooksData.length;
                if (emptySlotsNeeded > 0) {
                    for (let i = 0; i < emptySlotsNeeded; i++) {
                        const emptyDiv = document.createElement('div');
                        emptyDiv.className = 'empty-slot';
                        booksContainer.appendChild(emptyDiv);
                    }
                }
            } else {
                booksContainer.innerHTML = `<div class="empty-text">আপনার ক্লাসের জন্য কোনো ইবুক পাওয়া যায়নি।</div>`;
            }
        }
    } catch (err) {
        console.error("Error fetching books:", err);
        booksContainer.innerHTML = `<div class="empty-text" style="color:#ef4444;">বই লোড করতে সমস্যা হয়েছে।</div>`;
    }
}

// ==========================================
// ৪. মোডাল ও অধ্যায় আনলক সিস্টেম (৫০ ডায়মন্ড)
// ==========================================
function openModal(bookIndex) {
    const bookDoc = allBooksData[bookIndex];
    if (!bookDoc) return;
    
    const fields = bookDoc.fields;
    const bookName = fields.B_n ? fields.B_n.stringValue : 'বইয়ের নাম';
    
    document.getElementById('modalBookTitle').textContent = bookName;

    let chapters = [];
    if (fields.ChaptersData) {
        try {
            chapters = JSON.parse(fields.ChaptersData.stringValue);
        } catch (e) {
            chapters = [];
        }
    }

    const modalChaptersList = document.getElementById('modalChaptersList');
    modalChaptersList.innerHTML = '';

    if (chapters.length > 0) {
        chapters.forEach((ch, chIndex) => {
            const isPro = ch.type === 'pro';
            const unlockKey = `unlocked_${bookIndex}_${chIndex}`;
            const isAlreadyUnlocked = localStorage.getItem(unlockKey) === 'true';

            const li = document.createElement('li');
            li.className = 'chapter-item';

                         if (isPro && !isAlreadyUnlocked) {
                li.innerHTML = `
                    <span>${ch.name}</span>
                    <button class="unlock-btn" onclick="unlockChapter(${bookIndex}, ${chIndex}, 50, '${ch.link}')">
                        50 <i class="fa-solid fa-gem"></i> আনলক
                    </button>
                `;
            }
            
            else {
                li.innerHTML = `
                    <span>${ch.name} ${isPro ? '<i class="fa-solid fa-crown" style="color:#d97706;"></i>' : ''}</span>
                    <a href="${ch.link}" target="_blank">Free পড়ুন <i class="fa-solid fa-arrow-up-right-from-square"></i></a>
                `;
            }
            modalChaptersList.appendChild(li);
        });
    } else {
        modalChaptersList.innerHTML = `<li style="text-align:center; color:#94a3b8; padding:15px;">কোনো অধ্যায় নেই</li>`;
    }

    document.getElementById('chapterModal').style.display = 'flex';
}

// পেন্ডিং আনলক ডেটা রাখার ভেরিয়েবল
let pendingUnlockData = null;

function unlockChapter(bookIndex, chIndex, cost, link) {
    if (currentUser.diamonds < cost) {
        const insufficientModal = document.getElementById('insufficientModal');
        if (insufficientModal) {
            insufficientModal.style.display = 'flex';
        }
        return;
    }

    pendingUnlockData = { bookIndex, chIndex, cost, link };

    const confirmModal = document.getElementById('confirmModal');
    if (confirmModal) {
        confirmModal.style.display = 'flex';
    }
}

const confirmYesBtn = document.getElementById('confirmYesBtn');
if (confirmYesBtn) {
    confirmYesBtn.onclick = function() {
        if (!pendingUnlockData) return;

        const { bookIndex, chIndex, cost, link } = pendingUnlockData;

        currentUser.diamonds -= cost;
        localStorage.setItem('userSession', JSON.stringify(currentUser));
        localStorage.setItem(`unlocked_${bookIndex}_${chIndex}`, 'true');
        
        updateUI();
        closeConfirmModal();

        window.open(link, '_blank');
        openModal(bookIndex);
    };
}

function closeConfirmModal() {
    const confirmModal = document.getElementById('confirmModal');
    if (confirmModal) {
        confirmModal.style.display = 'none';
    }
    pendingUnlockData = null;
}

function closeInsufficientModal() {
    const insufficientModal = document.getElementById('insufficientModal');
    if (insufficientModal) {
        insufficientModal.style.display = 'none';
    }
}

function closeModal() {
    document.getElementById('chapterModal').style.display = 'none';
}

window.onclick = function(event) {
    const modal = document.getElementById('chapterModal');
    const redeemModal = document.getElementById('redeemModal');
    const confirmModal = document.getElementById('confirmModal');
    const insufficientModal = document.getElementById('insufficientModal');
    
    if (event.target === modal) closeModal();
    if (event.target === redeemModal) closeRedeemModal();
    if (event.target === confirmModal) closeConfirmModal();
    if (event.target === insufficientModal) closeInsufficientModal();
}

fetchBooks();
// ==========================================
// অ্যাকাউন্ট ডিলিট সিস্টেম
// ==========================================

// ১. সাইডবারের 'Delete Account' লিঙ্কে ক্লিক করলে কনফার্মেশন পপআপ দেখানোর লজিক
document.addEventListener('DOMContentLoaded', () => {
    const deleteBtn = document.querySelector('.delete-account');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', (e) => {
            e.preventDefault();
            
            // কাস্টম কনফার্মেশন পপআপ বা ব্রাউজারের কনফার্ম বক্স
            const isConfirmed = confirm("সতর্কবাণী: আপনি কি সত্যিই আপনার অ্যাকাউন্ট এবং সমস্ত ডাটা চিরতরে ডিলিট করতে চান? এই প্রক্রিয়াটি আর ফিরিয়ে আনা যাবে না!");
            
            if (isConfirmed) {
                deleteUserAccountCompletely();
            }
        });
    }
});

// ২. ফায়ারবেস এবং লোকালস্টোরেজ থেকে ডাটা মুছে ফেলার ফাংশন
async function deleteUserAccountCompletely() {
    try {
        // যদি currentUser-এর মধ্যে ফায়ারবেসের ডকুমেন্টের নির্দিষ্ট আইডি বা ফায়ারবেস ডকের নাম থাকে
        if (!currentUser || !currentUser.userId) {
            // যদি সরাসরি লোকালস্টোরেজ ক্লিয়ার করে লগইন পেজে পাঠাতে চান
            localStorage.clear();
            window.location.href = "loginebok.html";
            return;
        }

        // ফায়ারবেস থেকে ইউজারের ডকুমেন্ট খুঁজে বের করে ডিলিট করা
        const response = await fetch(endpoint + apiKey);
        const data = await response.json();

        if (data.documents) {
            let docNameToDelete = null;
            
            for (let doc of data.documents) {
                const fields = doc.fields;
                const dbUserId = fields["I'd"] ? fields["I'd"].stringValue : "";
                
                if (dbUserId === currentUser.userId) {
                    // ফায়ারবেসের ফুল পাথ যেমন: projects/.../documents/users/12345
                    docNameToDelete = doc.name; 
                    break;
                }
            }

            if (docNameToDelete) {
                // ফায়ারবেস থেকে ডাটা ডিলিট করার রিকোয়েস্ট (DELETE method)
                const deleteEndpoint = `https://firestore.googleapis.com/v1/${docNameToDelete}${apiKey}`;
                await fetch(deleteEndpoint, {
                    method: 'DELETE'
                });
            }
        }

        // লোকালস্টোরেজের সব সেশন ও সেভ করা ডাটা ক্লিয়ার করে দেওয়া
        localStorage.clear();
        
        alert("আপনার অ্যাকাউন্ট সফলভাবে মুছে ফেলা হয়েছে।");
        window.location.href = "loginebok.html";

    } catch (err) {
        console.error("Delete Account Error:", err);
        // কোনো কারণে ফায়ারবেস ডিলিট ফেইল করলেও লোকাল ডাটা পরিষ্কার করে লগইন পেজে পাঠিয়ে দেবে
        localStorage.clear();
        window.location.href = "loginebok.html";
    }
}
