// ใช้ URL ของ Google Apps Script
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzmMmfyQ1ofO5SOH__MFMr2vTV86D5gyErSQj9HdnnpU_VoHQXNfI8b2FkRJxXNNGyY/exec";

// Global State
let allRequestsCache = [];
let allMemosCache = [];
let userMemosCache = [];
let allUsersCache = [];
window.requestsChartInstance = null;
window.statusChartInstance = null;

// Flag เพื่อป้องกันการตั้งค่า event listeners ซ้ำ
let editPageListenersSetup = false;
let globalListenersSetup = false;

let specialPositionMap = {
    'รองผู้อำนวยการกลุ่มบริหารทั่วไป':'นางวชิรินทรา พัฒนกุลเดช',
    'รองผู้อำนวยการกลุ่มบริหารงานบุคคล':'นางปณิชา ภัสสิรากุล',
    'รองผู้อำนวยการกลุ่มบริหารงบประมาณ':'นางจันทิมา นกอยู่',
    'หัวหน้ากลุ่มบริหารวิชาการ': 'นายมงคล เกตมณี',
    'หัวหน้ากลุ่มสาระการเรียนรู้วิทยาศาสตร์และเทคโนโลยี': 'นางสาวปิยราช พันธุ์กมลศิลป์',
    'รองหัวหน้ากลุ่มสาระการเรียนรู้วิทยาศาสตร์และเทคโนโลยี':'นายอำนาจ ทัศนา',
    'หัวหน้ากลุ่มสาระการเรียนรู้คณิตศาสตร์': 'นายสมฤทธิ์ ชาญสมร',
    'หัวหน้ากลุ่มสาระการเรียนรู้ภาษาไทย': 'นายอานนท์ วรวงค์',
    'หัวหน้ากลุ่มสาระการเรียนรู้ภาษาต่างประเทศ': 'นางธรรมรักษ์ วัฒนพลาชัยกูร',
    'หัวหน้ากลุ่มสาระการเรียนรู้สังคมศึกษา ศาสนา และวัฒนธรรม': 'นางเกศริน ทองโพธิกุล',
    'หัวหน้ากลุ่มสาระการเรียนรู้สุขศึกษาและพลศึกษา': 'نางสาวเกษร เขจรลาภ',
    'หัวหน้ากลุ่มสาระการเรียนรู้ศิลปะ': 'นางสาวปิยลักษณ์ ขันทา',
    'หัวหน้ากลุ่มสาระการเรียนรู้การงานอาชีพ': 'นายสุชาติ สินทร',
    'หัวหน้างานแนะแนว':'นายเริงศักดิ์ จันทร์นวล',
    '.....................................':'.....................................'
};

const statusTranslations = {
    'Pending': 'กำลังดำเนินการ',
    'Submitted': 'รอการตรวจสอบ',
    'Approved': 'เสร็จสิ้น',
    'Pending Approval': 'รอการตรวจสอบ',
    'เสร็จสิ้น/รับไฟล์ไปใช้งาน': 'เสร็จสิ้น',
    'เสร็จสิ้น': 'เสร็จสิ้น',
    'รอเอกสาร (เบิก)': 'รอเอกสาร (เบิก)',
    'นำกลับไปแก้ไข': 'นำกลับไปแก้ไข',
    'เสร็จสิ้นรอออกคำสั่งไปราชการ': 'เสร็จสิ้นรอออกคำสั่ง',
    'รอตรวจสอบและออกคำสั่งไปราชการ': 'รอตรวจสอบและออกคำสั่ง',
    'กำลังดำเนินการ': 'กำลังดำเนินการ'
};

function translateStatus(status) {
    return statusTranslations[status] || status;
}

// --- API HELPER FUNCTIONS ---

async function apiCall(method, action, payload = {}) {
    let url = SCRIPT_URL;
    const options = {
        method: method,
        redirect: 'follow',
        headers: { 
            'Content-Type': 'text/plain;charset=utf-8',
        },
    };

    // เพิ่ม delay เพื่อป้องกัน Too Many Requests
    await new Promise(resolve => setTimeout(resolve, 1000));

    // เพิ่ม timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    options.signal = controller.signal;

    try {
        // สร้าง URL parameters สำหรับ GET
        if (method === 'GET') {
            const params = new URLSearchParams({ 
                action, 
                ...payload
            }); 
            url += `?${params}`;
            console.log(`🔗 GET ${action}:`, url);
        } else {
            // สำหรับ POST
            const requestBody = { action, payload };
            options.body = JSON.stringify(requestBody);
            console.log(`📤 POST ${action}:`, requestBody);
        }

        const response = await fetch(url, options);
        
        // Clear timeout เมื่อได้รับ response
        clearTimeout(timeoutId);

        // ตรวจสอบ HTTP status
        if (!response.ok) {
            if (response.status === 429) {
                throw new Error('มีการเรียกใช้งานมากเกินไป กรุณารอสักครู่แล้วลองใหม่');
            }
            
            const errorText = await response.text();
            console.error(`❌ HTTP ${response.status}:`, errorText);
            
            switch (response.status) {
                case 400:
                    throw new Error('คำขอไม่ถูกต้อง (Bad Request)');
                case 401:
                    throw new Error('ไม่มีสิทธิ์เข้าถึง (Unauthorized)');
                case 403:
                    throw new Error('ถูกห้ามเข้าถึง (Forbidden)');
                case 404:
                    throw new Error('ไม่พบข้อมูล (Not Found)');
                case 500:
                    throw new Error('ข้อผิดพลาดเซิร์ฟเวอร์ (Internal Server Error)');
                case 503:
                    throw new Error('บริการไม่พร้อมใช้งาน (Service Unavailable)');
                default:
                    throw new Error(`HTTP error! status: ${response.status}`);
            }
        }

        const result = await response.json();
        console.log(`✅ ${action} response:`, result);

        // ตรวจสอบผลลัพธ์จาก server
        if (result.status === 'error') {
            throw new Error(result.message || 'เกิดข้อผิดพลาดจากเซิร์ฟเวอร์');
        }

        return result;

    } catch (error) {
        // Clear timeout เมื่อเกิด error
        clearTimeout(timeoutId);
        
        console.error(`❌ API Call Error (${action}):`, error);
        
        // จัดการ error ตามประเภท
        if (error.name === 'AbortError') {
            showAlert('การเชื่อมต่อหมดเวลา', 'การเชื่อมต่อกับเซิร์ฟเวอร์ใช้เวลานานเกินไป กรุณาลองอีกครั้ง');
        } else if (error.message.includes('Failed to fetch') || error.message.includes('CORS')) {
            showAlert('การเชื่อมต่อล้มเหลว', 'ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้ อาจเกิดจากปัญหา CORS หรือการเชื่อมต่ออินเทอร์เน็ต');
        } else if (error.message.includes('NetworkError') || error.message.includes('NETWORK')) {
            showAlert('ปัญหาเครือข่าย', 'เกิดปัญหากับเครือข่ายอินเทอร์เน็ต กรุณาตรวจสอบการเชื่อมต่อ');
        } else if (error.message.includes('Too Many Requests') || error.message.includes('429')) {
            showAlert('ใช้งานมากเกินไป', 'มีการเรียกใช้งานระบบมากเกินไป กรุณารอ 1-2 นาทีแล้วลองใหม่');
        } else {
            // แสดง error message ที่เข้าใจง่าย
            const userFriendlyMessage = getFriendlyErrorMessage(error.message);
            showAlert('เกิดข้อผิดพลาด', userFriendlyMessage);
        }
        
        throw error;
    }
}

async function apiCallWithRetry(method, action, payload = {}, maxRetries = 2) {
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
        try {
            console.log(`🔄 พยายามเรียก ${action} (ครั้งที่ ${attempt}/${maxRetries + 1})`);
            return await apiCall(method, action, payload);
        } catch (error) {
            lastError = error;
            
            // ไม่ retry สำหรับ error บางประเภท
            if (error.message.includes('Unauthorized') || 
                error.message.includes('Forbidden') ||
                error.message.includes('Bad Request') ||
                error.message.includes('ไม่มีสิทธิ์') ||
                error.message.includes('ไม่ถูกต้อง')) {
                console.log(`⏹️ หยุด retry เนื่องจาก error ประเภทพิเศษ: ${error.message}`);
                break;
            }
            
            // รอก่อน retry ครั้งต่อไป
            if (attempt <= maxRetries) {
                const waitTime = 1000 * attempt; // 1s, 2s, 3s, ...
                console.log(`⏳ รอ ${waitTime/1000} วินาที ก่อนพยายามใหม่...`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
            }
        }
    }
    
    console.log(`❌ ล้มเหลวหลังจากพยายาม ${maxRetries + 1} ครั้ง`);
    throw lastError;
}

// ฟังก์ชันแปลง error message ให้เข้าใจง่าย
function getFriendlyErrorMessage(technicalMessage) {
    const friendlyMessages = {
        'Bad Request': 'ข้อมูลที่ส่งไม่ถูกต้อง',
        'Unauthorized': 'กรุณาเข้าสู่ระบบใหม่',
        'Forbidden': 'คุณไม่มีสิทธิ์ใช้งานฟังก์ชันนี้',
        'Not Found': 'ไม่พบข้อมูลที่ต้องการ',
        'Internal Server Error': 'เกิดข้อผิดพลาดในระบบ กรุณาลองใหม่ในภายหลัง',
        'Service Unavailable': 'ระบบกำลังบำรุงรักษา กรุณาลองใหม่ในภายหลัง',
        'timeout': 'การเชื่อมต่อใช้เวลานานเกินไป',
        'network': 'ปัญหาเครือข่ายอินเทอร์เน็ต'
    };

    // ค้นหา message ที่ตรง
    for (const [key, value] of Object.entries(friendlyMessages)) {
        if (technicalMessage.toLowerCase().includes(key.toLowerCase())) {
            return value;
        }
    }

    // ถ้าไม่เจอที่ตรง, ใช้ message เดิมแต่ตัดส่วน technical ออก
    return technicalMessage.split('(')[0].trim() || 'เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ';
}

// --- UTILITY FUNCTIONS ---

function showAlert(title, message) {
    const modal = document.getElementById('alert-modal');
    const titleEl = document.getElementById('alert-modal-title');
    const messageEl = document.getElementById('alert-modal-message');
    
    if (!modal || !titleEl || !messageEl) {
        console.error('Alert modal elements not found');
        return;
    }
    
    titleEl.textContent = title;
    messageEl.textContent = message;
    modal.style.display = 'flex';
}

function showConfirm(title, message) {
    const modal = document.getElementById('confirm-modal');
    const titleEl = document.getElementById('confirm-modal-title');
    const messageEl = document.getElementById('confirm-modal-message');
    
    if (!modal || !titleEl || !messageEl) {
        console.error('Confirm modal elements not found');
        return Promise.resolve(false);
    }
    
    titleEl.textContent = title;
    messageEl.textContent = message;
    modal.style.display = 'flex';

    return new Promise((resolve) => {
        const yesButton = document.getElementById('confirm-modal-yes-button');
        const noButton = document.getElementById('confirm-modal-no-button');
        
        if (!yesButton || !noButton) {
            console.error('Confirm modal buttons not found');
            resolve(false);
            return;
        }
        
        const onYes = () => { cleanup(); resolve(true); };
        const onNo = () => { cleanup(); resolve(false); };
        
        const cleanup = () => {
            modal.style.display = 'none';
            yesButton.removeEventListener('click', onYes);
            noButton.removeEventListener('click', onNo);
        };

        yesButton.addEventListener('click', onYes, { once: true });
        noButton.addEventListener('click', onNo, { once: true });
    });
}

function calculatePeopleCount(request) {
    if (!request) return { total: 1, category: 'solo' };

    let attendeeCount = 0;
    
    if (request.attendees) {
        if (Array.isArray(request.attendees)) {
            attendeeCount = request.attendees.length;
        } else if (typeof request.attendees === 'string') {
            try {
                const parsed = JSON.parse(request.attendees);
                attendeeCount = Array.isArray(parsed) ? parsed.length : 0;
            } catch (e) {
                console.error('Error parsing attendees:', e);
                attendeeCount = 0;
            }
        }
    }

    const totalPeople = attendeeCount + 1; // +1 สำหรับผู้ขอ

    let category = 'solo';
    if (totalPeople >= 2 && totalPeople <= 5) {
        category = 'groupSmall';
    } else if (totalPeople >= 6) {
        category = 'groupLarge';
    }

    return { total: totalPeople, category: category };
}

function toggleLoader(buttonId, show) {
    const button = document.getElementById(buttonId);
    if (!button) {
        console.error(`Button with id '${buttonId}' not found`);
        return;
    }
    
    const loader = button.querySelector('.loader');
    const text = button.querySelector('span');
    
    if (show) {
        if (loader) loader.classList.remove('hidden');
        if (text) text.classList.add('hidden');
        button.disabled = true;
    } else {
        if (loader) loader.classList.add('hidden');
        if (text) text.classList.remove('hidden');
        button.disabled = false;
    }
}

function getCurrentUser() {
    try {
        const userJson = sessionStorage.getItem('currentUser');
        return userJson ? JSON.parse(userJson) : null;
    } catch (error) {
        console.error('Error getting current user:', error);
        return null;
    }
}

async function fileToObject(file) {
    return new Promise((resolve, reject) => {
        if (!file) {
            reject(new Error('No file provided'));
            return;
        }
        
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const data = reader.result.toString().split(',')[1];
                resolve({ filename: file.name, mimeType: file.type, data: data });
            } catch (error) {
                reject(error);
            }
        };
        reader.onerror = error => reject(error);
        reader.readAsDataURL(file);
    });
}

function formatDisplayDate(dateString) {
    if (!dateString) return 'ไม่ระบุ';
    try {
        const date = new Date(dateString);
        // ป้องกันปัญหา timezone
        const adjustedDate = new Date(date.getTime() + (date.getTimezoneOffset() * 60000));
        const options = { year: 'numeric', month: 'short', day: 'numeric' };
        return adjustedDate.toLocaleDateString('th-TH', options);
    } catch (e) {
        console.error('Error formatting date:', e);
        return 'ไม่ระบุ';
    }
}

function clearRequestsCache() {
    allRequestsCache = [];
    allMemosCache = [];
    userMemosCache = [];
    console.log('✅ Cache cleared');
}

function checkAdminAccess() {
    const user = getCurrentUser();
    return user && user.role === 'admin';
}

async function loadSpecialPositions() {
    return new Promise(resolve => {
        console.log('Special positions loaded:', Object.keys(specialPositionMap).length);
        resolve();
    });
}

// --- PAGE NAVIGATION ---

async function switchPage(targetPageId) {
    console.log("🔄 Switching to page:", targetPageId);
    
    // ซ่อนทุกหน้า
    document.querySelectorAll('.page-view').forEach(page => {
        page.classList.add('hidden');
    });

    // แสดงหน้าเป้าหมาย
    const targetPage = document.getElementById(targetPageId);
    if (targetPage) {
        targetPage.classList.remove('hidden');
    }

    // อัพเดทปุ่มนำทาง
    document.querySelectorAll('.nav-button').forEach(btn => {
        btn.classList.remove('active');
        if(btn.dataset.target === targetPageId) {
            btn.classList.add('active');
        }
    });

    // ✅ รีเซ็ต flag เมื่อออกจากหน้าแก้ไข
    if (targetPageId !== 'edit-page') {
        editPageListenersSetup = false;
    }

    // ✅ เมื่อเปิดหน้าแก้ไข ให้ตั้งค่า event listeners
    if (targetPageId === 'edit-page') {
        setTimeout(() => {
            setupEditPageEventListeners();
        }, 100);
    }

    // โหลดข้อมูลตามหน้า
    try {
        if (targetPageId === 'dashboard-page') await fetchUserRequests();
        if (targetPageId === 'form-page') {
            await resetRequestForm();
            setTimeout(() => {
                tryAutoFillRequester();
            }, 100);
        }
        if (targetPageId === 'profile-page') loadProfileData();
        if (targetPageId === 'stats-page') await loadStatsData();
        if (targetPageId === 'admin-users-page') await fetchAllUsers();
        if (targetPageId === 'command-generation-page') {
            document.getElementById('admin-view-requests-tab').click();
        }
    } catch (error) {
        console.error(`Error loading data for page ${targetPageId}:`, error);
    }
}

// ✅ ฟังก์ชันรีเซ็ตหน้าแก้ไข
function resetEditPage() {
    console.log("🧹 Resetting edit page...");
    
    // รีเซ็ตฟอร์ม
    const editForm = document.getElementById('edit-request-form');
    if (editForm) editForm.reset();
    
    const attendeesList = document.getElementById('edit-attendees-list');
    if (attendeesList) attendeesList.innerHTML = '';
    
    const editResult = document.getElementById('edit-result');
    if (editResult) editResult.classList.add('hidden');
    
    // ล้างข้อมูลชั่วคราว
    sessionStorage.removeItem('currentEditRequestId');
    
    const editRequestId = document.getElementById('edit-request-id');
    if (editRequestId) editRequestId.value = '';
    
    const editDraftId = document.getElementById('edit-draft-id');
    if (editDraftId) editDraftId.value = '';
    
    // รีเซ็ตค่าเริ่มต้น
    const today = new Date().toISOString().split('T')[0];
    const docDate = document.getElementById('edit-doc-date');
    const startDate = document.getElementById('edit-start-date');
    const endDate = document.getElementById('edit-end-date');
    
    if (docDate) docDate.value = today;
    if (startDate) startDate.value = today;
    if (endDate) endDate.value = today;
    
    console.log("✅ Edit page reset complete");
}

// --- AUTH FUNCTIONS ---

async function handleLogin(e) {
    if (e) e.preventDefault();
    
    const username = document.getElementById('username')?.value.trim();
    const password = document.getElementById('password')?.value;

    if (!username || !password) {
        showAlert('ผิดพลาด', 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน');
        return;
    }

    toggleLoader('login-button', true);
    
    const loginError = document.getElementById('login-error');
    if (loginError) loginError.classList.add('hidden');
    
    try {
        console.log('Attempting login for:', username);
        const result = await apiCall('POST', 'verifyCredentials', { 
            username: username, 
            password: password 
        });
        
        console.log('Login result:', result);
        
        if (result.status === 'success') {
            sessionStorage.setItem('currentUser', JSON.stringify(result.user));
            window.currentUser = result.user;
            initializeUserSession(result.user);
            showMainApp();
            switchPage('dashboard-page');
            await fetchUserRequests();
            showAlert('สำเร็จ', 'เข้าสู่ระบบสำเร็จ');
        } else {
            if (loginError) {
                loginError.textContent = result.message || 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง';
                loginError.classList.remove('hidden');
            } else {
                showAlert('ผิดพลาด', result.message || 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
            }
        }
    } catch (error) {
        console.error('Login error:', error);
        if (loginError) {
            loginError.textContent = 'เกิดข้อผิดพลาดในการเข้าสู่ระบบ: ' + error.message;
            loginError.classList.remove('hidden');
        } else {
            showAlert('ผิดพลาด', 'เกิดข้อผิดพลาดในการเข้าสู่ระบบ: ' + error.message);
        }
    } finally {
        toggleLoader('login-button', false);
    }
}

// ✅ ฟังก์ชันออกจากระบบ
function handleLogout() {
    console.log("🚪 Logging out...");
    
    // ✅ รีเซ็ตหน้าแก้ไข
    resetEditPage();
    
    // ✅ ล้างข้อมูล session
    sessionStorage.removeItem('currentUser');
    sessionStorage.removeItem('currentEditRequestId');
    window.currentUser = null;
    
    // ✅ รีเซ็ต flags
    editPageListenersSetup = false;
    globalListenersSetup = false;
    
    // ✅ แสดงหน้าล็อกอิน
    showLoginScreen();
    
    console.log("✅ Logout completed");
}

// ✅ ฟังก์ชันจัดการลืมรหัสผ่าน
async function handleForgotPassword(e) {
    if (e) e.preventDefault();
    const email = document.getElementById('forgot-email')?.value.trim();
    if (!email) {
        showAlert('ผิดพลาด', 'กรุณากรอกอีเมล');
        return;
    }

    toggleLoader('forgot-password-submit-button', true);

    try {
        const result = await apiCall('POST', 'handleForgotPassword', { email: email });
        
        if (result.status === 'success') {
            const modal = document.getElementById('forgot-password-modal');
            if (modal) modal.style.display = 'none';
            
            const form = document.getElementById('forgot-password-form');
            if (form) form.reset();
            
            showAlert('ส่งสำเร็จ', 'ระบบได้ส่งรหัสผ่านใหม่ไปยังอีเมลของคุณแล้ว กรุณาตรวจสอบกล่องจดหมาย (Inbox)');
        } else {
            showAlert('ผิดพลาด', result.message);
        }
    } catch (error) {
        showAlert('ผิดพลาด', 'เกิดข้อผิดพลาดในการส่งคำขอ: ' + error.message);
    } finally {
        toggleLoader('forgot-password-submit-button', false);
    }
}

// ✅ ฟังก์ชันลงทะเบียน
async function handleRegister(e) {
    if (e) e.preventDefault();
    
    const formData = {
        username: document.getElementById('register-username')?.value.trim(),
        password: document.getElementById('register-password')?.value,
        fullName: document.getElementById('register-fullname')?.value.trim(),
        email: document.getElementById('register-email')?.value.trim(),
        position: document.getElementById('register-position')?.value.trim(),
        department: document.getElementById('register-department')?.value.trim(),
        role: 'user'
    };

    if (!formData.username || !formData.password || !formData.fullName || !formData.email) {
        showAlert('ผิดพลาด', 'กรุณากรอกข้อมูลให้ครบถ้วน (รวมถึงอีเมล)');
        return;
    }

    toggleLoader('register-submit-button', true);

    try {
        const result = await apiCall('POST', 'registerUser', formData);
        
        if (result.status === 'success') {
            showAlert('สำเร็จ', 'ลงทะเบียนสำเร็จ! กรุณาเข้าสู่ระบบ');
            const modal = document.getElementById('register-modal');
            if (modal) modal.style.display = 'none';
            
            const form = document.getElementById('register-form');
            if (form) form.reset();
        } else {
            showAlert('ผิดพลาด', result.message);
        }
    } catch (error) {
        showAlert('ผิดพลาด', 'เกิดข้อผิดพลาดในการลงทะเบียน: ' + error.message);
    } finally {
        toggleLoader('register-submit-button', false);
    }
}

// --- MAIN APP LOGIC ---

document.addEventListener('DOMContentLoaded', () => {
    console.log('App Initializing with Google Sheets Backend...');
    
    if (globalListenersSetup) {
        console.log('Global listeners already setup, skipping...');
        return;
    }
    
    setupEventListeners();
    enhanceEditFunctionSafety();

    // ตั้งค่าเริ่มต้นให้ Chart.js
    if (typeof Chart !== 'undefined') {
        Chart.defaults.font.family = "'Sarabun', sans-serif";
        Chart.defaults.font.size = 14;
        Chart.defaults.color = '#374151';
        Chart.defaults.borderColor = 'rgba(229, 231, 235, 0.5)';
        Chart.defaults.plugins.tooltip.enabled = true;
        Chart.defaults.plugins.tooltip.backgroundColor = 'rgba(17, 24, 39, 0.9)';
        Chart.defaults.plugins.tooltip.titleFont = { size: 16, weight: 'bold' };
        Chart.defaults.plugins.tooltip.bodyFont = { size: 14 };
        Chart.defaults.plugins.tooltip.padding = 10;
        Chart.defaults.plugins.tooltip.cornerRadius = 6;
        Chart.defaults.plugins.tooltip.displayColors = true;
        Chart.defaults.plugins.tooltip.boxPadding = 4;
    }

    // ✅ ตรวจสอบว่าแท็บแก้ไขถูกซ่อนอยู่เสมอเมื่อเริ่มต้น
    const navEdit = document.getElementById('nav-edit');
    if (navEdit) {
        navEdit.classList.add('hidden');
    }
    
    // ✅ รีเซ็ตหน้าแก้ไขเมื่อเริ่มต้น
    resetEditPage();
    
    // ✅ โหลดตำแหน่งพิเศษ
    loadSpecialPositions();
    
    const user = getCurrentUser();
    if (user) {
        initializeUserSession(user);
    } else {
        showLoginScreen();
    }
    
    globalListenersSetup = true;
    console.log('✅ App initialization completed');
});

// --- INITIALIZATION ---

function initializeUserSession(user) {
    if (!user) return;
    
    updateUIForUser(user);
    showMainApp();
    switchPage('dashboard-page');
}

function updateUIForUser(user) {
    const fullnameEl = document.getElementById('user-fullname');
    const positionEl = document.getElementById('user-position');
    
    if (fullnameEl) fullnameEl.textContent = user.fullName || 'N/A';
    if (positionEl) positionEl.textContent = user.position || 'N/A';

    const isAdmin = user.role === 'admin';
    const adminNavCommand = document.getElementById('admin-nav-command');
    const adminNavUsers = document.getElementById('admin-nav-users');
    
    if (adminNavCommand) adminNavCommand.classList.toggle('hidden', !isAdmin);
    if (adminNavUsers) adminNavUsers.classList.toggle('hidden', !isAdmin);
}

function showMainApp() {
    const loginScreen = document.getElementById('login-screen');
    const mainApp = document.getElementById('main-app');
    
    if (loginScreen) loginScreen.classList.add('hidden');
    if (mainApp) mainApp.classList.remove('hidden');
}

// ✅ ฟังก์ชันแสดงหน้าล็อกอิน
function showLoginScreen() {
    console.log("🔐 Showing login screen");
    
    // ✅ รีเซ็ตทุกหน้าและ state
    resetEditPage();
    
    // ✅ ซ่อนทุกหน้าและแสดงหน้าล็อกอิน
    document.querySelectorAll('.page-view').forEach(page => {
        page.classList.add('hidden');
    });
    
    const editPage = document.getElementById('edit-page');
    const mainApp = document.getElementById('main-app');
    const loginScreen = document.getElementById('login-screen');
    
    if (editPage) editPage.classList.add('hidden');
    if (mainApp) mainApp.classList.add('hidden');
    if (loginScreen) loginScreen.classList.remove('hidden');
    
    // ✅ รีเซ็ตสถานะปุ่มนำทาง
    document.querySelectorAll('.nav-button').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // ✅ เปิดหน้าแดชบอร์ดเป็น default
    const userNavDashboard = document.getElementById('user-nav-dashboard');
    if (userNavDashboard) userNavDashboard.classList.add('active');
    
    // ✅ ล้างข้อมูล session
    sessionStorage.removeItem('currentUser');
    sessionStorage.removeItem('currentEditRequestId');
    window.currentUser = null;
    
    // ✅ รีเซ็ตฟอร์มล็อกอิน
    const loginForm = document.getElementById('login-form');
    const loginError = document.getElementById('login-error');
    
    if (loginForm) loginForm.reset();
    if (loginError) loginError.classList.add('hidden');
    
    console.log("✅ Login screen ready");
}

// --- EVENT LISTENER SETUP ---

function setupEventListeners() {
    if (globalListenersSetup) {
        console.log('Event listeners already setup, skipping...');
        return;
    }

    // Auth
    const loginForm = document.getElementById('login-form');
    const logoutButton = document.getElementById('logout-button');
    const showRegisterModalButton = document.getElementById('show-register-modal-button');
    const registerForm = document.getElementById('register-form');
    
    if (loginForm) loginForm.addEventListener('submit', handleLogin);
    if (logoutButton) logoutButton.addEventListener('click', handleLogout);
    if (showRegisterModalButton) showRegisterModalButton.addEventListener('click', () => {
        const modal = document.getElementById('register-modal');
        if (modal) modal.style.display = 'flex';
    });
    if (registerForm) registerForm.addEventListener('submit', handleRegister);
    
    // ✅ เพิ่มการตั้งค่าพาหนะแบบหลายตัวเลือก
    setupVehicleMultipleSelection();
    
    // Stats page events
    const refreshStats = document.getElementById('refresh-stats');
    const exportStats = document.getElementById('export-stats');
    
    if (refreshStats) refreshStats.addEventListener('click', async () => {
        await loadStatsData();
        showAlert('สำเร็จ', 'อัพเดทข้อมูลสถิติเรียบร้อยแล้ว');
    });

    if (exportStats) exportStats.addEventListener('click', exportStatsReport);

    // Navigation
    const navigation = document.getElementById('navigation');
    if (navigation) {
        navigation.addEventListener('click', (e) => {
            const navButton = e.target.closest('.nav-button');
            if (navButton && navButton.dataset.target) {
                switchPage(navButton.dataset.target);
            }
        });
    }

    // Modals
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.style.display = 'none';
        });
    });
    
    // Modal close buttons
    const closeButtons = [
        { id: 'register-modal-close-button', modal: 'register-modal' },
        { id: 'register-modal-close-button2', modal: 'register-modal' },
        { id: 'alert-modal-close-button', modal: 'alert-modal' },
        { id: 'confirm-modal-close-button', modal: 'confirm-modal' },
        { id: 'send-memo-modal-close-button', modal: 'send-memo-modal' },
        { id: 'command-approval-modal-close-button', modal: 'command-approval-modal' },
        { id: 'dispatch-modal-close-button', modal: 'dispatch-modal' },
        { id: 'admin-memo-action-modal-close-button', modal: 'admin-memo-action-modal' },
        { id: 'forgot-password-modal-close-button', modal: 'forgot-password-modal' }
    ];
    
    closeButtons.forEach(button => {
        const element = document.getElementById(button.id);
        if (element) {
            element.addEventListener('click', () => {
                const modal = document.getElementById(button.modal);
                if (modal) modal.style.display = 'none';
            });
        }
    });
    
    // Cancel buttons
    const cancelButtons = [
        { id: 'send-memo-cancel-button', modal: 'send-memo-modal' },
        { id: 'command-approval-cancel-button', modal: 'command-approval-modal' },
        { id: 'dispatch-cancel-button', modal: 'dispatch-modal' },
        { id: 'admin-memo-cancel-button', modal: 'admin-memo-action-modal' },
        { id: 'forgot-password-cancel-button', modal: 'forgot-password-modal' }
    ];
    
    cancelButtons.forEach(button => {
        const element = document.getElementById(button.id);
        if (element) {
            element.addEventListener('click', () => {
                const modal = document.getElementById(button.modal);
                if (modal) modal.style.display = 'none';
            });
        }
    });

    // Alert modal OK button
    const alertOkButton = document.getElementById('alert-modal-ok-button');
    if (alertOkButton) {
        alertOkButton.addEventListener('click', () => {
            const modal = document.getElementById('alert-modal');
            if (modal) modal.style.display = 'none';
        });
    }

    // Modal Event Listeners ใหม่
    const commandApprovalForm = document.getElementById('command-approval-form');
    const dispatchForm = document.getElementById('dispatch-form');
    const adminMemoActionForm = document.getElementById('admin-memo-action-form');
    
    if (commandApprovalForm) commandApprovalForm.addEventListener('submit', handleCommandApproval);
    if (dispatchForm) dispatchForm.addEventListener('submit', handleDispatchFormSubmit);
    if (adminMemoActionForm) adminMemoActionForm.addEventListener('submit', handleAdminMemoActionSubmit);
    
    // Event listenerสำหรับแสดง/ซ่อนส่วนอัพโหลดไฟล์
    const adminMemoStatus = document.getElementById('admin-memo-status');
    if (adminMemoStatus) {
        adminMemoStatus.addEventListener('change', function(e) {
            const fileUploads = document.getElementById('admin-file-uploads');
            if (fileUploads) {
                if (e.target.value === 'เสร็จสิ้น/รับไฟล์ไปใช้งาน') {
                    fileUploads.classList.remove('hidden');
                } else {
                    fileUploads.classList.add('hidden');
                }
            }
        });
    }
    
    // Forgot Password Modal
    const showForgotPasswordButton = document.getElementById('show-forgot-password-modal-button');
    const forgotPasswordForm = document.getElementById('forgot-password-form');
    
    if (showForgotPasswordButton) showForgotPasswordButton.addEventListener('click', () => {
        const modal = document.getElementById('forgot-password-modal');
        if (modal) modal.style.display = 'flex';
    });
    
    if (forgotPasswordForm) forgotPasswordForm.addEventListener('submit', handleForgotPassword);
    
    // Forms
    const requestForm = document.getElementById('request-form');
    const formAddAttendee = document.getElementById('form-add-attendee');
    const formImportExcel = document.getElementById('form-import-excel');
    const excelFileInput = document.getElementById('excel-file-input');
    const formDownloadTemplate = document.getElementById('form-download-template');
    
    if (requestForm) requestForm.addEventListener('submit', handleRequestFormSubmit);
    if (formAddAttendee) formAddAttendee.addEventListener('click', () => addAttendeeField());
    if (formImportExcel) formImportExcel.addEventListener('click', () => {
        if (excelFileInput) excelFileInput.click();
    });
    if (excelFileInput) excelFileInput.addEventListener('change', handleExcelImport);
    if (formDownloadTemplate) formDownloadTemplate.addEventListener('click', downloadAttendeeTemplate);
    
    // Expense and Vehicle options
    document.querySelectorAll('input[name="expense_option"]').forEach(radio => {
        radio.addEventListener('change', toggleExpenseOptions);
    });
    
    document.querySelectorAll('input[name="vehicle_option"]').forEach(radio => {
        radio.addEventListener('change', toggleVehicleOptions);
    });
    
    // Send Memo Form
    const sendMemoForm = document.getElementById('send-memo-form');
    if (sendMemoForm) sendMemoForm.addEventListener('submit', handleMemoSubmitFromModal);
    
    document.querySelectorAll('input[name="modal_memo_type"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            const fileContainer = document.getElementById('modal-memo-file-container');
            const fileInput = document.getElementById('modal-memo-file');
            const isReimburse = e.target.value === 'reimburse';
            if (fileContainer) fileContainer.classList.toggle('hidden', isReimburse);
            if (fileInput) fileInput.required = !isReimburse;
        });
    });

    // Profile forms
    const profileForm = document.getElementById('profile-form');
    const passwordForm = document.getElementById('password-form');
    const showPasswordToggle = document.getElementById('show-password-toggle');
    
    if (profileForm) profileForm.addEventListener('submit', handleProfileUpdate);
    if (passwordForm) passwordForm.addEventListener('submit', handlePasswordUpdate);
    if (showPasswordToggle) showPasswordToggle.addEventListener('change', togglePasswordVisibility);
    
    // Department change
    const formDepartment = document.getElementById('form-department');
    if (formDepartment) {
        formDepartment.addEventListener('change', (e) => {
            const selectedPosition = e.target.value;
            const headNameInput = document.getElementById('form-head-name');
            if (headNameInput) headNameInput.value = specialPositionMap[selectedPosition] || '';
        });
    }
    
    // ✅ NEW: Edit Form Event Listeners - ใช้การจัดการแบบแยกต่างหากใน setupEditPageEventListeners
    
    // ✅ NEW: Create New Request Button
    const createNewRequestBtn = document.getElementById('create-new-request-button');
    if (createNewRequestBtn) {
        createNewRequestBtn.addEventListener('click', openNewRequestForm);
    }
    
    // ✅ NEW: Save Draft Button
    const saveDraftBtn = document.getElementById('save-draft-button');
    if (saveDraftBtn) {
        saveDraftBtn.addEventListener('click', saveDraft);
    }
    
    // Requests List Actions
    const requestsList = document.getElementById('requests-list');
    if (requestsList) {
        requestsList.addEventListener('click', handleRequestAction);
    }
    
    // Search
    const searchRequests = document.getElementById('search-requests');
    if (searchRequests) {
        searchRequests.addEventListener('input', (e) => renderRequestsList(allRequestsCache, userMemosCache, e.target.value));
    }

    // Admin
    const addUserButton = document.getElementById('add-user-button');
    const downloadUserTemplateButton = document.getElementById('download-user-template-button');
    const importUsersButton = document.getElementById('import-users-button');
    const userExcelInput = document.getElementById('user-excel-input');
    
    if (addUserButton) addUserButton.addEventListener('click', openAddUserModal);
    if (downloadUserTemplateButton) downloadUserTemplateButton.addEventListener('click', downloadUserTemplate);
    if (importUsersButton) importUsersButton.addEventListener('click', () => {
        if (userExcelInput) userExcelInput.click();
    });
    if (userExcelInput) userExcelInput.addEventListener('change', handleUserImport);
    
    // Admin Page Tabs
    const adminViewRequestsTab = document.getElementById('admin-view-requests-tab');
    const adminViewMemosTab = document.getElementById('admin-view-memos-tab');
    
    if (adminViewRequestsTab) {
        adminViewRequestsTab.addEventListener('click', (e) => {
            if (adminViewMemosTab) adminViewMemosTab.classList.remove('active');
            e.target.classList.add('active');
            
            const adminRequestsView = document.getElementById('admin-requests-view');
            const adminMemosView = document.getElementById('admin-memos-view');
            
            if (adminRequestsView) adminRequestsView.classList.remove('hidden');
            if (adminMemosView) adminMemosView.classList.add('hidden');
            
            fetchAllRequestsForCommand();
        });
    }
    
    if (adminViewMemosTab) {
        adminViewMemosTab.addEventListener('click', (e) => {
            if (adminViewRequestsTab) adminViewRequestsTab.classList.remove('active');
            e.target.classList.add('active');
            
            const adminRequestsView = document.getElementById('admin-requests-view');
            const adminMemosView = document.getElementById('admin-memos-view');
            
            if (adminRequestsView) adminRequestsView.classList.add('hidden');
            if (adminMemosView) adminMemosView.classList.remove('hidden');
            
            fetchAllMemos();
        });
    }

    // ✅ NEW: Back to Dashboard from Edit Page
    const backToDashboardBtn = document.getElementById('back-to-dashboard');
    if (backToDashboardBtn) {
        backToDashboardBtn.addEventListener('click', () => {
            console.log("🏠 Returning to dashboard from edit page");
            switchPage('dashboard-page');
        });
    }

    // ✅ Global Error Handler
    window.addEventListener('error', (event) => {
        console.error('Global error:', event.error);
        
        if (event.error && event.error.message && event.error.message.includes('openEditPageDirect')) {
            console.warn('Ignoring openEditPageDirect error - function no longer exists');
            return;
        }
        
        showAlert("ข้อผิดพลาดระบบ", "เกิดข้อผิดพลาดที่ไม่คาดคิด กรุณารีเฟรชหน้าเว็บ");
    });

    window.addEventListener('unhandledrejection', (event) => {
        console.error('Unhandled promise rejection:', event.reason);
        
        if (event.reason && event.reason.message && event.reason.message.includes('openEditPageDirect')) {
            console.warn('Ignoring openEditPageDirect promise rejection');
            return;
        }
        
        showAlert("ข้อผิดพลาดระบบ", "เกิดข้อผิดพลาดในการทำงาน กรุณารีเฟรชหน้าเว็บ");
    });

    console.log('✅ All event listeners setup completed');
}

// --- EDIT PAGE FUNCTIONS ---
// ==================== EDIT PAGE FUNCTIONS ====================

// ✅ ฟังก์ชันตั้งค่า Event Listeners สำหรับหน้าแก้ไข
function setupEditPageEventListeners() {
    console.log("🔧 Setting up edit page event listeners...");
    
    if (editPageListenersSetup) {
        console.log("Edit page listeners already setup, skipping...");
        return;
    }
    
    // ✅ ลบ event listeners เดิมก่อน (ป้องกัน duplication)
    removeEditPageEventListeners();
    
    // ✅ ปุ่มกลับสู่แดชบอร์ด
    const backButton = document.getElementById('back-to-dashboard');
    if (backButton) {
        backButton.addEventListener('click', handleBackToDashboard);
    }
    
    // ✅ ปุ่มสร้างเอกสาร - ใช้การจัดการผ่าน form submit แทน
    const generateButton = document.getElementById('generate-document-button');
    if (generateButton) {
        generateButton.addEventListener('click', handleGenerateDocument);
    }
    
    // ✅ ปุ่มเพิ่มผู้ร่วมเดินทาง
    const addAttendeeButton = document.getElementById('edit-add-attendee');
    if (addAttendeeButton) {
        addAttendeeButton.addEventListener('click', handleAddEditAttendee);
    }
    
    // ✅ Expense options
    document.querySelectorAll('input[name="edit-expense_option"]').forEach(radio => {
        radio.addEventListener('change', handleEditExpenseOptionChange);
    });
    
    // ✅ Vehicle options
    document.querySelectorAll('input[name="edit-vehicle_option"]').forEach(radio => {
        radio.addEventListener('change', handleEditVehicleOptionChange);
    });
    
    // ✅ Department change
    const departmentSelect = document.getElementById('edit-department');
    if (departmentSelect) {
        departmentSelect.addEventListener('change', handleEditDepartmentChange);
    }
    
    // ✅ ตั้งค่า expense options เริ่มต้น
    toggleEditExpenseOptions();
    
    // ✅ ตั้งค่า vehicle options เริ่มต้น
    toggleEditVehicleOptions();
    
    editPageListenersSetup = true;
    console.log("✅ Edit page event listeners setup completed");
}

// ✅ ฟังก์ชันลบ Event Listeners เดิม
function removeEditPageEventListeners() {
    const elements = [
        { id: 'back-to-dashboard', event: 'click', handler: handleBackToDashboard },
        { id: 'generate-document-button', event: 'click', handler: handleGenerateDocument },
        { id: 'edit-add-attendee', event: 'click', handler: handleAddEditAttendee },
        { id: 'edit-department', event: 'change', handler: handleEditDepartmentChange }
    ];
    
    elements.forEach(item => {
        const element = document.getElementById(item.id);
        if (element) {
            element.removeEventListener(item.event, item.handler);
        }
    });
    
    // ลบ event listeners จาก radio buttons
    document.querySelectorAll('input[name="edit-expense_option"]').forEach(radio => {
        radio.removeEventListener('change', handleEditExpenseOptionChange);
    });
    
    document.querySelectorAll('input[name="edit-vehicle_option"]').forEach(radio => {
        radio.removeEventListener('change', handleEditVehicleOptionChange);
    });
}

// ✅ Event Handlers
function handleBackToDashboard() {
    console.log("🏠 Returning to dashboard from edit page");
    switchPage('dashboard-page');
}

function handleGenerateDocument(e) {
    if (e) {
        e.preventDefault();
        e.stopPropagation();
    }
    console.log("📄 Generate document button clicked");
    generateDocumentFromDraft();
}

function handleAddEditAttendee() {
    addEditAttendeeField();
}

function handleEditExpenseOptionChange() {
    toggleEditExpenseOptions();
}

function handleEditVehicleOptionChange() {
    toggleEditVehicleOptions();
}

function handleEditDepartmentChange(e) {
    const selectedPosition = e.target.value;
    const headNameInput = document.getElementById('edit-head-name');
    if (headNameInput) headNameInput.value = specialPositionMap[selectedPosition] || '';
}

// ✅ ฟังก์ชันเติมข้อมูลในฟอร์มแก้ไข
async function populateEditForm(requestData) {
    try {
        console.log("📝 Populating edit form with:", requestData);
        
        // แสดง loading state
        showEditPageLoading(true);
        
        // เติมข้อมูลพื้นฐาน
        const draftIdInput = document.getElementById('edit-draft-id');
        const requestIdInput = document.getElementById('edit-request-id');
        
        if (draftIdInput) draftIdInput.value = requestData.draftId || '';
        if (requestIdInput) requestIdInput.value = requestData.requestId || requestData.id || '';
        
        // เติมวันที่
        const formatDateForInput = (dateValue) => {
            if (!dateValue) return '';
            try {
                const date = new Date(dateValue);
                if (isNaN(date)) return '';
                return date.toISOString().split('T')[0];
            } catch (e) {
                return '';
            }
        };
        
        const docDate = document.getElementById('edit-doc-date');
        const requesterName = document.getElementById('edit-requester-name');
        const requesterPosition = document.getElementById('edit-requester-position');
        const location = document.getElementById('edit-location');
        const purpose = document.getElementById('edit-purpose');
        const startDate = document.getElementById('edit-start-date');
        const endDate = document.getElementById('edit-end-date');
        
        if (docDate) docDate.value = formatDateForInput(requestData.docDate);
        if (requesterName) requesterName.value = requestData.requesterName || '';
        if (requesterPosition) requesterPosition.value = requestData.requesterPosition || '';
        if (location) location.value = requestData.location || '';
        if (purpose) purpose.value = requestData.purpose || '';
        if (startDate) startDate.value = formatDateForInput(requestData.startDate);
        if (endDate) endDate.value = formatDateForInput(requestData.endDate);
        
        // เติมผู้ร่วมเดินทาง
        const attendeesList = document.getElementById('edit-attendees-list');
        if (attendeesList) attendeesList.innerHTML = '';
        
        if (requestData.attendees && requestData.attendees.length > 0) {
            console.log("👥 Loading attendees:", requestData.attendees);
            requestData.attendees.forEach((attendee, index) => {
                if (attendee.name && attendee.position) {
                    addEditAttendeeField(attendee.name, attendee.position);
                }
            });
        } else {
            console.log("👥 No attendees found");
        }
        
        // เติมข้อมูลค่าใช้จ่าย
        await fillEditExpenseData(requestData);
        
        // เติมข้อมูลการเดินทาง
        await fillEditVehicleData(requestData);
        
        // เติมข้อมูลผู้ลงนาม
        await fillEditSignerData(requestData);
        
        // ซ่อน loading state
        showEditPageLoading(false);
        
        console.log("✅ Edit form populated successfully");
        
    } catch (error) {
        console.error("❌ Error populating edit form:", error);
        showEditPageLoading(false);
        throw error;
    }
}

// ✅ ฟังก์ชันเติมข้อมูลค่าใช้จ่าย
async function fillEditExpenseData(requestData) {
    const expenseOption = requestData.expenseOption || 'no';
    
    if (expenseOption === 'partial') {
        const expensePartial = document.getElementById('edit-expense_partial');
        if (expensePartial) expensePartial.checked = true;
        toggleEditExpenseOptions();
        
        if (requestData.expenseItems && requestData.expenseItems.length > 0) {
            const expenseItems = Array.isArray(requestData.expenseItems) ? 
                requestData.expenseItems : 
                JSON.parse(requestData.expenseItems || '[]');
            
            console.log("💰 Loading expense items:", expenseItems);
            
            expenseItems.forEach(item => {
                const checkboxes = document.querySelectorAll('input[name="edit-expense_item"]');
                checkboxes.forEach(chk => {
                    if (chk.dataset.itemName === item.name) {
                        chk.checked = true;
                        if (item.name === 'ค่าใช้จ่ายอื่นๆ' && item.detail) {
                            const otherText = document.getElementById('edit-expense_other_text');
                            if (otherText) otherText.value = item.detail;
                        }
                    }
                });
            });
        }
        
        if (requestData.totalExpense) {
            const totalExpense = document.getElementById('edit-total-expense');
            if (totalExpense) totalExpense.value = requestData.totalExpense;
        }
    } else {
        const expenseNo = document.getElementById('edit-expense_no');
        if (expenseNo) expenseNo.checked = true;
        toggleEditExpenseOptions();
    }
}

// ✅ ฟังก์ชันเติมข้อมูลการเดินทาง
async function fillEditVehicleData(requestData) {
    const vehicleOption = requestData.vehicleOption || 'gov';
    
    const vehicleRadio = document.getElementById(`edit-vehicle_${vehicleOption}`);
    if (vehicleRadio) {
        vehicleRadio.checked = true;
        toggleEditVehicleOptions();
        
        if (vehicleOption === 'private' && requestData.licensePlate) {
            const licensePlate = document.getElementById('edit-license-plate');
            if (licensePlate) licensePlate.value = requestData.licensePlate;
        }
    }
}

// ✅ ฟังก์ชันเติมข้อมูลผู้ลงนาม
async function fillEditSignerData(requestData) {
    if (requestData.department) {
        const department = document.getElementById('edit-department');
        if (department) department.value = requestData.department;
        const headNameInput = document.getElementById('edit-head-name');
        if (headNameInput) headNameInput.value = specialPositionMap[requestData.department] || '';
    }
    
    if (requestData.headName) {
        const headNameInput = document.getElementById('edit-head-name');
        if (headNameInput) headNameInput.value = requestData.headName;
    }
}

// ✅ ฟังก์ชันเพิ่มผู้ร่วมเดินทางในหน้าแก้ไข
function addEditAttendeeField(name = '', position = '') {
    const list = document.getElementById('edit-attendees-list');
    if (!list) return;
    
    const attendeeDiv = document.createElement('div');
    attendeeDiv.className = 'grid grid-cols-1 md:grid-cols-3 gap-2 items-center mb-2';
    
    const isStandardPosition = ['ผู้อำนวยการ', 'รองผู้อำนวยการ', 'ครู', 'ครูผู้ช่วย', 'พนักงานราชการ', 'ครูอัตราจ้าง', 'พนักงานขับรถ', 'นักเรียน'].includes(position);
    const selectValue = isStandardPosition ? position : (position ? 'other' : '');
    const otherValue = !isStandardPosition && position ? position : '';
    
    attendeeDiv.innerHTML = `
        <input type="text" class="form-input attendee-name md:col-span-1" placeholder="ชื่อ-นามสกุล" value="${name}" required>
        <div class="attendee-position-wrapper md:col-span-1">
            <select class="form-input attendee-position-select">
                <option value="">-- เลือกตำแหน่ง --</option>
                <option value="ผู้อำนวยการ">ผู้อำนวยการ</option>
                <option value="รองผู้อำนวยการ">รองผู้อำนวยการ</option>
                <option value="ครู">ครู</option>
                <option value="ครูผู้ช่วย">ครูผู้ช่วย</option>
                <option value="พนักงานราชการ">พนักงานราชการ</option>
                <option value="ครูอัตราจ้าง">ครูอัตราจ้าง</option>
                <option value="พนักงานขับรถ">พนักงานขับรถ</option>
                <option value="นักเรียน">นักเรียน</option>
                <option value="other">อื่นๆ (โปรดระบุ)</option>
            </select>
            <input type="text" class="form-input attendee-position-other hidden mt-1" placeholder="ระบุตำแหน่ง" value="${otherValue}">
        </div>
        <button type="button" class="btn btn-danger btn-sm remove-attendee">ลบ</button>
    `;
    list.appendChild(attendeeDiv);
    
    // ตั้งค่า select value
    const select = attendeeDiv.querySelector('.attendee-position-select');
    const otherInput = attendeeDiv.querySelector('.attendee-position-other');

    if (selectValue) {
        select.value = selectValue;
        if (selectValue === 'other') {
            otherInput.classList.remove('hidden');
        }
    }

    // Event listener สำหรับ select change
    select.addEventListener('change', () => {
        otherInput.classList.toggle('hidden', select.value !== 'other');
        if (select.value !== 'other') {
            otherInput.value = '';
        }
    });
    
    // Event listener สำหรับปุ่มลบ
    const removeButton = attendeeDiv.querySelector('.remove-attendee');
    removeButton.addEventListener('click', function() {
        attendeeDiv.remove();
    });
}

// ✅ ฟังก์ชัน toggle สำหรับหน้าแก้ไข - Expense
function toggleEditExpenseOptions() {
    const partialOptions = document.getElementById('edit-partial-expense-options');
    const totalContainer = document.getElementById('edit-total-expense-container');
    
    const expensePartial = document.getElementById('edit-expense_partial');
    
    if (expensePartial?.checked) {
        if (partialOptions) partialOptions.classList.remove('hidden');
        if (totalContainer) totalContainer.classList.remove('hidden');
    } else {
        if (partialOptions) partialOptions.classList.add('hidden');
        if (totalContainer) totalContainer.classList.add('hidden');
        
        // รีเซ็ตค่า expense items
        document.querySelectorAll('input[name="edit-expense_item"]').forEach(chk => {
            chk.checked = false;
        });
        const otherText = document.getElementById('edit-expense_other_text');
        if (otherText) otherText.value = '';
        const totalExpense = document.getElementById('edit-total-expense');
        if (totalExpense) totalExpense.value = '';
    }
}

// ✅ ฟังก์ชัน toggle สำหรับหน้าแก้ไข - Vehicle
function toggleEditVehicleOptions() {
    const privateDetails = document.getElementById('edit-private-vehicle-details');
    const publicDetails = document.getElementById('edit-public-vehicle-details');
    
    const vehiclePrivate = document.getElementById('edit-vehicle_private');
    const vehiclePublic = document.getElementById('edit-vehicle_public');
    
    if (vehiclePrivate?.checked) {
        if (privateDetails) privateDetails.classList.remove('hidden');
    } else {
        if (privateDetails) privateDetails.classList.add('hidden');
        const licensePlate = document.getElementById('edit-license-plate');
        if (licensePlate) licensePlate.value = '';
    }
    
    if (vehiclePublic?.checked) {
        if (publicDetails) publicDetails.classList.remove('hidden');
    } else {
        if (publicDetails) publicDetails.classList.add('hidden');
        const otherVehicle = document.getElementById('edit-other-vehicle');
        if (otherVehicle) otherVehicle.value = '';
    }
}

// ✅ ฟังก์ชันเปิดหน้าแก้ไข
async function openEditPage(requestId) {
    try {
        console.log("🔓 Opening edit page for request:", requestId);

        if (!requestId || requestId === 'undefined' || requestId === 'null') {
            showAlert("ผิดพลาด", "ไม่พบรหัสคำขอ");
            return;
        }

        const user = getCurrentUser();
        if (!user) {
            showAlert("ผิดพลาด", "กรุณาเข้าสู่ระบบใหม่");
            return;
        }

        const username = user.username;
        
        console.log("📡 Calling API with:", { requestId, username });

        // รีเซ็ตฟอร์มก่อนโหลดข้อมูลใหม่
        resetEditPage();
        
        // แสดง loading state
        const attendeesList = document.getElementById('edit-attendees-list');
        if (attendeesList) {
            attendeesList.innerHTML = `
                <div class="text-center p-4">
                    <div class="loader mx-auto"></div>
                    <p class="mt-2">กำลังโหลดข้อมูล...</p>
                </div>`;
        }

        const result = await apiCall('GET', 'getDraftRequest', { 
            requestId: requestId, 
            username: username 
        });

        console.log("🔥 Raw API Response:", result);

        if (result.status === 'success' && result.data) {
            let data = result.data;
            
            // Handle nested data structure
            if (result.data && result.data.data) {
                data = result.data.data;
                console.log("🔄 Found nested data structure, using result.data.data");
            }
            
            if (data.status === 'error') {
                console.error("❌ Error in data:", data.message);
                showAlert("ผิดพลาด", data.message || "เกิดข้อผิดพลาดในการดึงข้อมูล");
                return;
            }
            
            console.log("✅ Data received successfully from server");
            console.log("🔍 Processed data:", data);

            if (!data || Object.keys(data).length === 0) {
                console.warn("⚠️ Empty data received");
                showAlert("ข้อมูลว่างเปล่า", "ไม่พบข้อมูลสำหรับโหลดลงฟอร์ม");
                return;
            }

            // ปรับปรุงข้อมูลผู้ขอจาก user profile ถ้าจำเป็น
            data.attendees = Array.isArray(data.attendees) ? data.attendees : [];

            if ((!data.requesterName || data.requesterName.trim() === '') && user?.fullName) {
                data.requesterName = user.fullName;
                console.log("👤 Filled requesterName from user profile:", data.requesterName);
            }
            if ((!data.requesterPosition || data.requesterPosition.trim() === '') && user?.position) {
                data.requesterPosition = user.position;
                console.log("👤 Filled requesterPosition from user profile:", data.requesterPosition);
            }

            // บันทึก requestId ใน sessionStorage
            sessionStorage.setItem('currentEditRequestId', requestId);

            // เติมข้อมูลลงในฟอร์ม
            await populateEditForm(data);

            // ตั้งค่า Event Listeners
            setupEditPageEventListeners();

            // เปลี่ยนหน้า
            switchPage('edit-page');
            
            console.log("✅ Edit page opened successfully with requestId:", requestId);
            
        } else {
            console.error("❌ API returned error:", result.message || "No data received");
            showAlert("ผิดพลาด", result.message || "ไม่พบข้อมูลคำขอหรือไม่สามารถโหลดข้อมูลได้");
        }

    } catch (error) {
        console.error("❌ Error loading edit data:", error);
        showAlert("ผิดพลาด", "ไม่สามารถโหลดข้อมูลสำหรับแก้ไขได้: " + error.message);
    }
}

// ✅ ฟังก์ชันสำหรับเปิดหน้าแก้ไขโดยตรง
function openEditPageDirect(requestId) {
    console.log("Direct edit opening for:", requestId);
    openEditPage(requestId);
}

// ✅ ฟังก์ชันสำหรับตรวจสอบการเข้าถึงหน้าแก้ไข
function ensureEditAccess(requestId) {
    const user = getCurrentUser();
    if (!user) {
        showAlert("ผิดพลาด", "กรุณาเข้าสู่ระบบใหม่");
        return false;
    }
    
    if (user.role !== 'admin') {
        const userRequest = allRequestsCache.find(req => req.id === requestId);
        if (!userRequest || userRequest.username !== user.username) {
            showAlert("ผิดพลาด", "คุณไม่มีสิทธิ์แก้ไขคำขอนี้");
            return false;
        }
    }
    
    return true;
}

// ✅ ฟังก์ชันสร้างเอกสารจากข้อมูลที่แก้ไข
async function generateDocumentFromDraft() {
    console.log("=== generateDocumentFromDraft START ===");
    
    let requestId = document.getElementById('edit-request-id')?.value;
    const draftId = document.getElementById('edit-draft-id')?.value;
    
    if (!requestId) {
        requestId = sessionStorage.getItem('currentEditRequestId');
        if (requestId) {
            const requestIdInput = document.getElementById('edit-request-id');
            if (requestIdInput) requestIdInput.value = requestId;
            console.log("Retrieved requestId from sessionStorage:", requestId);
        }
    }
    
    console.log("Final requestId:", requestId, "draftId:", draftId);
    
    if (!requestId) {
        showAlert("ผิดพลาด", "ไม่พบรหัสคำขอ กรุณากลับไปที่แดชบอร์ดและเปิดหน้าแก้ไขใหม่");
        return;
    }

    const formData = getEditFormData();
    if (!formData) {
        return;
    }
    
    if (!validateEditForm(formData)) {
        return;
    }
    
    formData.requestId = requestId;
    formData.draftId = draftId;
    formData.isEdit = true;
    
    console.log("Sending data to server:", formData);
    
    toggleLoader('generate-document-button', true);
    
    try {
        const result = await apiCall('POST', 'updateRequest', formData);
        console.log("updateRequest result:", result);
        
        if (result.status === 'success') {
            const resultTitle = document.getElementById('edit-result-title');
            const resultMessage = document.getElementById('edit-result-message');
            const resultLink = document.getElementById('edit-result-link');
            const editResult = document.getElementById('edit-result');
            
            if (resultTitle) resultTitle.textContent = 'อัพเดทเอกสารสำเร็จ!';
            if (resultMessage) resultMessage.textContent = `บันทึกข้อความสำหรับ ID ${result.data.id || requestId} ถูกอัพเดทแล้ว`;
            
            if (result.data.pdfUrl && resultLink) {
                resultLink.href = result.data.pdfUrl;
                resultLink.classList.remove('hidden');
            } else if (resultLink) {
                resultLink.classList.add('hidden');
            }
            
            if (editResult) editResult.classList.remove('hidden');
            
            clearRequestsCache();
            await fetchUserRequests();
            
            sessionStorage.removeItem('currentEditRequestId');
            
            showAlert("สำเร็จ", "อัพเดทเอกสารเรียบร้อยแล้ว");
            
        } else {
            showAlert("ผิดพลาด", result.message || "ไม่สามารถอัพเดทเอกสารได้");
        }
    } catch (error) {
        console.error("Error updating document:", error);
        showAlert("เกิดข้อผิดพลาด", "ไม่สามารถอัพเดทเอกสารได้: " + error.message);
    } finally {
        toggleLoader('generate-document-button', false);
    }
    
    console.log("=== generateDocumentFromDraft END ===");
}

// ✅ ฟังก์ชันบันทึกข้อมูลคำขอ (Draft)
async function saveDraft() {
    const formData = getEditFormData();
    const requestId = document.getElementById('edit-request-id')?.value;
    
    if (!validateEditForm(formData)) {
        return;
    }
    
    formData.isEdit = !!requestId;
    
    toggleLoader('save-draft-button', true);
    
    try {
        const result = await apiCall('POST', 'saveDraftRequest', formData);
        
        if (result.status === 'success') {
            const draftIdInput = document.getElementById('edit-draft-id');
            const requestIdInput = document.getElementById('edit-request-id');
            
            if (draftIdInput) draftIdInput.value = result.data.draftId || '';
            if (result.data.requestId && requestIdInput) {
                requestIdInput.value = result.data.requestId;
            }
            showAlert("สำเร็จ", formData.isEdit ? "อัพเดทข้อมูลคำขอเรียบร้อยแล้ว" : "บันทึกข้อมูลคำขอเรียบร้อยแล้ว");
        } else {
            showAlert("ผิดพลาด", result.message || "ไม่สามารถบันทึกข้อมูลได้");
        }
    } catch (error) {
        console.error("Error saving draft:", error);
        showAlert("ผิดพลาด", "ไม่สามารถบันทึกข้อมูลได้: " + error.message);
    } finally {
        toggleLoader('save-draft-button', false);
    }
}

// ✅ ฟังก์ชันดึงข้อมูลจากฟอร์มแก้ไข
function getEditFormData() {
    try {
        let requestId = document.getElementById('edit-request-id')?.value;
        const draftId = document.getElementById('edit-draft-id')?.value;
        
        if (!requestId) {
            requestId = sessionStorage.getItem('currentEditRequestId');
            if (requestId) {
                const requestIdInput = document.getElementById('edit-request-id');
                if (requestIdInput) requestIdInput.value = requestId;
            }
        }
        
        if (!requestId) {
            const urlParams = new URLSearchParams(window.location.search);
            requestId = urlParams.get('requestId');
        }
        
        console.log("Getting edit form data - Request ID:", requestId, "Draft ID:", draftId);
        
        if (!requestId && !draftId) {
            console.error("No requestId or draftId found!");
            showAlert("ระบบผิดพลาด", "ไม่พบรหัสคำขอ กรุณากลับไปที่แดชบอร์ดและลองใหม่");
            return null;
        }

        const expenseItems = [];
        const expenseOption = document.querySelector('input[name="edit-expense_option"]:checked');
        
        if (expenseOption && expenseOption.value === 'partial') {
            document.querySelectorAll('input[name="edit-expense_item"]:checked').forEach(chk => {
                const item = { name: chk.dataset.itemName };
                if (item.name === 'ค่าใช้จ่ายอื่นๆ') {
                    const otherText = document.getElementById('edit-expense_other_text');
                    if (otherText) item.detail = otherText.value.trim();
                }
                expenseItems.push(item);
            });
        }

        const attendees = Array.from(document.querySelectorAll('#edit-attendees-list > div')).map(div => {
            const nameInput = div.querySelector('.attendee-name');
            const select = div.querySelector('.attendee-position-select');
            let position = select ? select.value : '';
            
            if (position === 'other') {
                const otherInput = div.querySelector('.attendee-position-other');
                position = otherInput ? otherInput.value.trim() : '';
            }
            
            return {
                name: nameInput ? nameInput.value.trim() : '',
                position: position
            };
        }).filter(att => att.name && att.position);

        const user = getCurrentUser();
        if (!user) {
            showAlert("ผิดพลาด", "กรุณาเข้าสู่ระบบใหม่");
            return null;
        }

        // ✅ ดึงข้อมูลพาหนะแบบใหม่
        const vehicleData = getEditVehicleDataFromForm();
        
        // ✅ ตรวจสอบว่ามีการเลือกพาหนะอย่างน้อย 1 อย่าง
        if (vehicleData.vehicleOptions.length === 0) {
            showAlert('ข้อมูลไม่ครบถ้วน', 'กรุณาเลือกพาหนะอย่างน้อย 1 ชนิด');
            return null;
        }

        const formData = {
            draftId: draftId || '',
            requestId: requestId || '',
            username: user.username,
            docDate: document.getElementById('edit-doc-date')?.value || '',
            requesterName: document.getElementById('edit-requester-name')?.value.trim() || '',
            requesterPosition: document.getElementById('edit-requester-position')?.value.trim() || '',
            location: document.getElementById('edit-location')?.value.trim() || '',
            purpose: document.getElementById('edit-purpose')?.value.trim() || '',
            startDate: document.getElementById('edit-start-date')?.value || '',
            endDate: document.getElementById('edit-end-date')?.value || '',
            attendees: attendees,
            expenseOption: expenseOption ? expenseOption.value : 'no',
            expenseItems: expenseItems,
            totalExpense: document.getElementById('edit-total-expense')?.value || 0,
            // ✅ ใช้ข้อมูลพาหนะแบบใหม่แทน vehicleOption เดิม
            vehicleOptions: vehicleData.vehicleOptions,
            vehicleDetails: vehicleData.vehicleDetails,
            department: document.getElementById('edit-department')?.value || '',
            headName: document.getElementById('edit-head-name')?.value || '',
            isEdit: true
        };

        console.log("Edit form data prepared:", formData);
        return formData;
        
    } catch (error) {
        console.error("Error in getEditFormData:", error);
        showAlert("ระบบผิดพลาด", "ไม่สามารถอ่านข้อมูลจากฟอร์มได้");
        return null;
    }
}

// ✅ ฟังก์ชัน validation สำหรับหน้าแก้ไข
function validateEditForm(formData) {
    console.log("Validating edit form:", formData);
    
    // ตรวจสอบวันที่
    if (!formData.docDate) {
        showAlert("ข้อมูลไม่ครบถ้วน", "กรุณากรอกวันที่");
        return false;
    }
    
    // ตรวจสอบข้อมูลผู้ขอ
    if (!formData.requesterName || !formData.requesterPosition) {
        showAlert("ข้อมูลไม่ครบถ้วน", "กรุณากรอกชื่อและตำแหน่งผู้ขอ");
        return false;
    }
    
    // ตรวจสอบสถานที่
    if (!formData.location) {
        showAlert("ข้อมูลไม่ครบถ้วน", "กรุณากรอกสถานที่ไปราชการ");
        return false;
    }
    
    // ตรวจสอบวัตถุประสงค์
    if (!formData.purpose) {
        showAlert("ข้อมูลไม่ครบถ้วน", "กรุณากรอกวัตถุประสงค์");
        return false;
    }
    
    // ตรวจสอบวันที่เริ่มต้นและสิ้นสุด
    if (!formData.startDate || !formData.endDate) {
        showAlert("ข้อมูลไม่ครบถ้วน", "กรุณากรอกวันที่เริ่มต้นและสิ้นสุด");
        return false;
    }
    
    const startDate = new Date(formData.startDate);
    const endDate = new Date(formData.endDate);
    
    if (startDate > endDate) {
        showAlert("ข้อมูลไม่ถูกต้อง", "วันที่เริ่มต้นต้องมาก่อนวันที่สิ้นสุด");
        return false;
    }
    
    // ตรวจสอบข้อมูลผู้ร่วมเดินทาง
    if (formData.attendees && formData.attendees.length > 0) {
        const invalidAttendees = formData.attendees.filter(att => 
            !att.name || !att.position || att.name.trim() === '' || att.position.trim() === ''
        );
        if (invalidAttendees.length > 0) {
            showAlert("ข้อมูลไม่ครบถ้วน", "กรุณากรอกชื่อและตำแหน่งผู้ร่วมเดินทางให้ครบถ้วน");
            return false;
        }
    }
    
    // ตรวจสอบข้อมูลค่าใช้จ่าย
    if (formData.expenseOption === 'partial' && formData.expenseItems.length === 0) {
        showAlert("ข้อมูลไม่ครบถ้วน", "กรุณาเลือกรายการค่าใช้จ่ายที่ต้องการเบิก");
        return false;
    }
    
    // ตรวจสอบข้อมูลการแก้ไข
    if (formData.isEdit && !formData.requestId && !formData.draftId) {
        showAlert("ข้อมูลไม่ครบถ้วน", "ไม่พบรหัสคำขอสำหรับการแก้ไข");
        return false;
    }
    
    console.log("Edit form validation passed");
    return true;
}

// ✅ ฟังก์ชันแสดง/ซ่อน loading state
function showEditPageLoading(show) {
    const loadingElement = document.getElementById('edit-loading');
    if (loadingElement) {
        loadingElement.classList.toggle('hidden', !show);
    }
}

// ✅ ฟังก์ชันตรวจสอบว่ามีการเปลี่ยนแปลงข้อมูลในฟอร์ม
function isEditFormDirty() {
    const originalData = sessionStorage.getItem('originalEditFormData');
    if (!originalData) return false;
    
    const currentData = JSON.stringify(getEditFormData());
    return originalData !== currentData;
}

// ✅ ฟังก์ชันบันทึกข้อมูลต้นฉบับของฟอร์ม
function saveOriginalFormData() {
    const formData = getEditFormData();
    if (formData) {
        sessionStorage.setItem('originalEditFormData', JSON.stringify(formData));
    }
}

// ✅ ฟังก์ชันเพิ่มความปลอดภัยให้ฟังก์ชันแก้ไข
function enhanceEditFunctionSafety() {
    const requiredFunctions = [
        'openEditPage', 
        'generateDocumentFromDraft', 
        'saveDraft',
        'getEditFormData',
        'populateEditForm',
        'setupEditPageEventListeners',
        'resetEditPage'
    ];
    
    requiredFunctions.forEach(funcName => {
        if (typeof window[funcName] !== 'function') {
            console.error(`Required function ${funcName} is missing`);
            window[funcName] = function() {
                showAlert("ระบบผิดพลาด", "ฟังก์ชันไม่พร้อมใช้งาน กรุณารีเฟรชหน้า");
            };
        }
    });
    
    console.log('✅ Edit function safety check completed');
}

// ==================== VEHICLE MULTIPLE SELECTION FUNCTIONS ====================

// ✅ ฟังก์ชันจัดการการเลือกพาหนะในฟอร์มสร้างคำขอ
function setupVehicleMultipleSelection() {
    console.log("🚗 Setting up vehicle multiple selection...");
    
    // ฟอร์มสร้างคำขอ
    const privateCheckbox = document.getElementById('vehicle_private');
    const publicCheckbox = document.getElementById('vehicle_public');
    
    if (privateCheckbox) {
        privateCheckbox.addEventListener('change', togglePrivateVehicleDetails);
    }
    
    if (publicCheckbox) {
        publicCheckbox.addEventListener('change', togglePublicVehicleDetails);
    }
    
    // ฟอร์มแก้ไข
    const editPrivateCheckbox = document.getElementById('edit-vehicle_private');
    const editPublicCheckbox = document.getElementById('edit-vehicle_public');
    
    if (editPrivateCheckbox) {
        editPrivateCheckbox.addEventListener('change', toggleEditPrivateVehicleDetails);
    }
    
    if (editPublicCheckbox) {
        editPublicCheckbox.addEventListener('change', toggleEditPublicVehicleDetails);
    }
}

// ✅ ฟังก์ชันแสดง/ซ่อนรายละเอียดรถส่วนตัว (ฟอร์มสร้าง)
function togglePrivateVehicleDetails() {
    const privateDetails = document.getElementById('private-vehicle-details');
    const licensePlateInput = document.getElementById('form-license-plate');
    
    if (this.checked) {
        if (privateDetails) privateDetails.classList.remove('hidden');
        if (licensePlateInput) licensePlateInput.required = true;
    } else {
        if (privateDetails) privateDetails.classList.add('hidden');
        if (licensePlateInput) {
            licensePlateInput.required = false;
            licensePlateInput.value = '';
        }
    }
}

// ✅ ฟังก์ชันแสดง/ซ่อนรายละเอียดพาหนะอื่นๆ (ฟอร์มสร้าง)
function togglePublicVehicleDetails() {
    const publicDetails = document.getElementById('public-vehicle-details');
    const otherVehicleInput = document.getElementById('form-other-vehicle');
    
    if (this.checked) {
        if (publicDetails) publicDetails.classList.remove('hidden');
        if (otherVehicleInput) otherVehicleInput.required = true;
    } else {
        if (publicDetails) publicDetails.classList.add('hidden');
        if (otherVehicleInput) {
            otherVehicleInput.required = false;
            otherVehicleInput.value = '';
        }
    }
}

// ✅ ฟังก์ชันแสดง/ซ่อนรายละเอียดรถส่วนตัว (ฟอร์มแก้ไข)
function toggleEditPrivateVehicleDetails() {
    const privateDetails = document.getElementById('edit-private-vehicle-details');
    const licensePlateInput = document.getElementById('edit-license-plate');
    
    if (this.checked) {
        if (privateDetails) privateDetails.classList.remove('hidden');
        if (licensePlateInput) licensePlateInput.required = true;
    } else {
        if (privateDetails) privateDetails.classList.add('hidden');
        if (licensePlateInput) {
            licensePlateInput.required = false;
            licensePlateInput.value = '';
        }
    }
}

// ✅ ฟังก์ชันแสดง/ซ่อนรายละเอียดพาหนะอื่นๆ (ฟอร์มแก้ไข)
function toggleEditPublicVehicleDetails() {
    const publicDetails = document.getElementById('edit-public-vehicle-details');
    const otherVehicleInput = document.getElementById('edit-other-vehicle');
    
    if (this.checked) {
        if (publicDetails) publicDetails.classList.remove('hidden');
        if (otherVehicleInput) otherVehicleInput.required = true;
    } else {
        if (publicDetails) publicDetails.classList.add('hidden');
        if (otherVehicleInput) {
            otherVehicleInput.required = false;
            otherVehicleInput.value = '';
        }
    }
}

// ✅ ฟังก์ชันดึงข้อมูลพาหนะจากฟอร์มสร้างคำขอ
function getVehicleDataFromForm() {
    const selectedVehicles = [];
    const vehicleDetails = {};
    
    // ตรวจสอบพาหนะที่ถูกเลือก
    if (document.getElementById('vehicle_gov')?.checked) {
        selectedVehicles.push('gov');
    }
    
    if (document.getElementById('vehicle_private')?.checked) {
        selectedVehicles.push('private');
        const licensePlate = document.getElementById('form-license-plate');
        if (licensePlate) vehicleDetails.licensePlate = licensePlate.value.trim();
    }
    
    if (document.getElementById('vehicle_public')?.checked) {
        selectedVehicles.push('public');
        const otherVehicle = document.getElementById('form-other-vehicle');
        if (otherVehicle) vehicleDetails.otherVehicle = otherVehicle.value.trim();
    }
    
    return {
        vehicleOptions: selectedVehicles,
        vehicleDetails: vehicleDetails
    };
}

// ✅ ฟังก์ชันดึงข้อมูลพาหนะจากฟอร์มแก้ไข
function getEditVehicleDataFromForm() {
    const selectedVehicles = [];
    const vehicleDetails = {};
    
    // ตรวจสอบพาหนะที่ถูกเลือก
    if (document.getElementById('edit-vehicle_gov')?.checked) {
        selectedVehicles.push('gov');
    }
    
    if (document.getElementById('edit-vehicle_private')?.checked) {
        selectedVehicles.push('private');
        const licensePlate = document.getElementById('edit-license-plate');
        if (licensePlate) vehicleDetails.licensePlate = licensePlate.value.trim();
    }
    
    if (document.getElementById('edit-vehicle_public')?.checked) {
        selectedVehicles.push('public');
        const otherVehicle = document.getElementById('edit-other-vehicle');
        if (otherVehicle) vehicleDetails.otherVehicle = otherVehicle.value.trim();
    }
    
    return {
        vehicleOptions: selectedVehicles,
        vehicleDetails: vehicleDetails
    };
}

// ✅ ฟังก์ชันเติมข้อมูลพาหนะในฟอร์มแก้ไข
function fillEditVehicleData(requestData) {
    console.log("🚗 Filling vehicle data:", requestData);
    
    // รีเซ็ตค่าทั้งหมดก่อน
    document.querySelectorAll('input[name="edit-vehicle_option"]').forEach(checkbox => {
        checkbox.checked = false;
    });
    
    // ซ่อนรายละเอียดทั้งหมด
    const privateDetails = document.getElementById('edit-private-vehicle-details');
    const publicDetails = document.getElementById('edit-public-vehicle-details');
    
    if (privateDetails) privateDetails.classList.add('hidden');
    if (publicDetails) publicDetails.classList.add('hidden');
    
    // เติมข้อมูลพาหนะ
    if (requestData.vehicleOptions && Array.isArray(requestData.vehicleOptions)) {
        requestData.vehicleOptions.forEach(option => {
            const checkbox = document.getElementById(`edit-vehicle_${option}`);
            if (checkbox) {
                checkbox.checked = true;
                
                // แสดงรายละเอียดถ้าจำเป็น
                if (option === 'private') {
                    if (privateDetails) privateDetails.classList.remove('hidden');
                    if (requestData.vehicleDetails?.licensePlate) {
                        const licensePlate = document.getElementById('edit-license-plate');
                        if (licensePlate) licensePlate.value = requestData.vehicleDetails.licensePlate;
                    }
                }
                
                if (option === 'public') {
                    if (publicDetails) publicDetails.classList.remove('hidden');
                    if (requestData.vehicleDetails?.otherVehicle) {
                        const otherVehicle = document.getElementById('edit-other-vehicle');
                        if (otherVehicle) otherVehicle.value = requestData.vehicleDetails.otherVehicle;
                    }
                }
            }
        });
    } else {
        // กรณีข้อมูลเก่าที่ใช้ radio button
        const oldVehicleOption = requestData.vehicleOption || 'gov';
        const oldCheckbox = document.getElementById(`edit-vehicle_${oldVehicleOption}`);
        if (oldCheckbox) {
            oldCheckbox.checked = true;
            
            if (oldVehicleOption === 'private' && requestData.licensePlate) {
                if (privateDetails) privateDetails.classList.remove('hidden');
                const licensePlate = document.getElementById('edit-license-plate');
                if (licensePlate) licensePlate.value = requestData.licensePlate;
            }
        }
    }
}

// ✅ ฟังก์ชันแปลงข้อมูลพาหนะสำหรับแสดงผล
function formatVehicleDisplay(vehicleData) {
    if (!vehicleData || !vehicleData.vehicleOptions || vehicleData.vehicleOptions.length === 0) {
        return 'ไม่ระบุ';
    }
    
    const vehicleNames = {
        'gov': 'รถยนต์ราชการ (รถโรงเรียน)',
        'private': 'รถยนต์ส่วนตัว',
        'public': 'พาหนะอื่นๆ'
    };
    
    const displayText = vehicleData.vehicleOptions.map(option => vehicleNames[option]).join(', ');
    
    // เพิ่มรายละเอียดถ้ามี
    const details = [];
    if (vehicleData.vehicleDetails?.licensePlate) {
        details.push(`ทะเบียน: ${vehicleData.vehicleDetails.licensePlate}`);
    }
    if (vehicleData.vehicleDetails?.otherVehicle) {
        details.push(`พาหนะ: ${vehicleData.vehicleDetails.otherVehicle}`);
    }
    
    if (details.length > 0) {
        return `${displayText} (${details.join(', ')})`;
    }
    
    return displayText;
}

// ✅ ฟังก์ชันตรวจสอบสถานะการแก้ไข
function checkEditPageStatus() {
    console.log("🔍 Edit Page Status Check:");
    console.log("- currentEditRequestId:", sessionStorage.getItem('currentEditRequestId'));
    console.log("- openEditPage function:", typeof openEditPage);
    console.log("- populateEditForm function:", typeof populateEditForm);
    console.log("- edit page element:", document.getElementById('edit-page'));
    console.log("- edit form element:", document.getElementById('edit-request-form'));
    console.log("- setupEditPageEventListeners function:", typeof setupEditPageEventListeners);
}

// ✅ ทำให้ฟังก์ชันพาหนะสามารถเรียกใช้จาก global scope ได้
window.setupVehicleMultipleSelection = setupVehicleMultipleSelection;
window.getVehicleDataFromForm = getVehicleDataFromForm;
window.getEditVehicleDataFromForm = getEditVehicleDataFromForm;
window.fillEditVehicleData = fillEditVehicleData;
window.formatVehicleDisplay = formatVehicleDisplay;

// ✅ ทำให้ฟังก์ชันสามารถเรียกใช้จาก global scope ได้
window.openEditPage = openEditPage;
window.openEditPageDirect = openEditPageDirect;
window.setupEditPageEventListeners = setupEditPageEventListeners;
window.resetEditPage = resetEditPage;
window.checkEditPageStatus = checkEditPageStatus;
window.addEditAttendeeField = addEditAttendeeField;
window.toggleEditExpenseOptions = toggleEditExpenseOptions;
window.toggleEditVehicleOptions = toggleEditVehicleOptions;

// --- PROFILE FUNCTIONS ---

function loadProfileData() {
    const user = getCurrentUser();
    if (!user) return;

    const profileFullname = document.getElementById('profile-fullname');
    const profileEmail = document.getElementById('profile-email');
    const profilePosition = document.getElementById('profile-position');
    const profileDepartment = document.getElementById('profile-department');
    const profileUsername = document.getElementById('profile-username');
    
    if (profileFullname) profileFullname.value = user.fullName || '';
    if (profileEmail) profileEmail.value = user.email || '';
    if (profilePosition) profilePosition.value = user.position || '';
    if (profileDepartment) profileDepartment.value = user.department || '';
    if (profileUsername) profileUsername.value = user.username || '';
}

async function handleProfileUpdate(e) {
    if (e) e.preventDefault();
    
    const user = getCurrentUser();
    if (!user) return;

    const formData = {
        username: user.username,
        fullName: document.getElementById('profile-fullname')?.value || '',
        email: document.getElementById('profile-email')?.value.trim() || '',
        position: document.getElementById('profile-position')?.value || '',
        department: document.getElementById('profile-department')?.value || ''
    };

    toggleLoader('profile-submit-button', true);

    try {
        const result = await apiCall('POST', 'updateUserProfile', formData);
        
        if (result.status === 'success') {
            const updatedUser = { ...user, ...formData };
            sessionStorage.setItem('currentUser', JSON.stringify(updatedUser));
            updateUIForUser(updatedUser);
            
            showAlert('สำเร็จ', 'อัพเดทข้อมูลส่วนตัวสำเร็จ');
        } else {
            showAlert('ผิดพลาด', result.message);
        }
    } catch (error) {
        showAlert('ผิดพลาด', 'เกิดข้อผิดพลาดในการอัพเดทข้อมูล: ' + error.message);
    } finally {
        toggleLoader('profile-submit-button', false);
    }
}

async function handlePasswordUpdate(e) {
    if (e) e.preventDefault();
    
    const user = getCurrentUser();
    if (!user) return;

    const formData = {
        username: user.username,
        oldPassword: document.getElementById('current-password')?.value || '',
        newPassword: document.getElementById('new-password')?.value || ''
    };

    if (!formData.oldPassword || !formData.newPassword) {
        showAlert('ผิดพลาด', 'กรุณากรอกรหัสผ่านปัจจุบันและรหัสผ่านใหม่');
        return;
    }

    toggleLoader('password-submit-button', true);

    try {
        const result = await apiCall('POST', 'updatePassword', formData);
        
        if (result.status === 'success') {
            showAlert('สำเร็จ', 'เปลี่ยนรหัสผ่านสำเร็จ');
            const passwordForm = document.getElementById('password-form');
            if (passwordForm) passwordForm.reset();
        } else {
            showAlert('ผิดพลาด', result.message);
        }
    } catch (error) {
        showAlert('ผิดพลาด', 'เกิดข้อผิดพลาดในการเปลี่ยนรหัสผ่าน: ' + error.message);
    } finally {
        toggleLoader('password-submit-button', false);
    }
}

function togglePasswordVisibility() {
    const showPasswordToggle = document.getElementById('show-password-toggle');
    const currentPassword = document.getElementById('current-password');
    const newPassword = document.getElementById('new-password');
    
    if (!showPasswordToggle || !currentPassword || !newPassword) return;
    
    const showPassword = showPasswordToggle.checked;
    currentPassword.type = showPassword ? 'text' : 'password';
    newPassword.type = showPassword ? 'text' : 'password';
}

// --- REQUEST FUNCTIONS ---

async function fetchUserRequests() {
    try {
        const user = getCurrentUser();
        if (!user) return;

        const requestsLoader = document.getElementById('requests-loader');
        const requestsList = document.getElementById('requests-list');
        const noRequestsMessage = document.getElementById('no-requests-message');
        
        if (requestsLoader) requestsLoader.classList.remove('hidden');
        if (requestsList) requestsList.classList.add('hidden');
        if (noRequestsMessage) noRequestsMessage.classList.add('hidden');

        const [requestsResult, memosResult] = await Promise.all([
            apiCall('GET', 'getUserRequests', { username: user.username }),
            apiCall('GET', 'getSentMemos', { username: user.username })
        ]);
        
        if (requestsResult.status === 'success') {
            allRequestsCache = requestsResult.data || [];
            userMemosCache = memosResult.data || [];
            renderRequestsList(allRequestsCache, userMemosCache);
        }
    } catch (error) {
        console.error('Error fetching requests:', error);
        showAlert('ผิดพลาด', 'ไม่สามารถโหลดข้อมูลคำขอได้');
    } finally {
        const requestsLoader = document.getElementById('requests-loader');
        if (requestsLoader) requestsLoader.classList.add('hidden');
    }
}

function renderRequestsList(requests, memos, searchTerm = '') {
    const container = document.getElementById('requests-list');
    const noRequestsMessage = document.getElementById('no-requests-message');
    
    if (!container || !noRequestsMessage) return;
    
    if (!requests || requests.length === 0) {
        container.classList.add('hidden');
        noRequestsMessage.classList.remove('hidden');
        return;
    }

    let filteredRequests = requests;
    if (searchTerm) {
        filteredRequests = requests.filter(req => 
            (req.purpose && req.purpose.toLowerCase().includes(searchTerm.toLowerCase())) ||
            (req.location && req.location.toLowerCase().includes(searchTerm.toLowerCase())) ||
            (req.id && req.id.toLowerCase().includes(searchTerm.toLowerCase()))
        );
    }

    if (filteredRequests.length === 0) {
        container.classList.add('hidden');
        noRequestsMessage.classList.remove('hidden');
        noRequestsMessage.textContent = 'ไม่พบคำขอที่ตรงกับการค้นหา';
        return;
    }

    container.innerHTML = filteredRequests.map(request => {
        const relatedMemo = memos.find(memo => memo.refNumber === request.id);
        
        let displayRequestStatus = request.status;
        let displayCommandStatus = request.commandStatus;
        
        if (relatedMemo) {
            displayRequestStatus = relatedMemo.status;
            displayCommandStatus = relatedMemo.status === 'เสร็จสิ้น/รับไฟล์ไปใช้งาน' ? 'เสร็จสิ้น' : relatedMemo.status;
        }
        
        const hasCompletedFiles = relatedMemo && (
            relatedMemo.completedMemoUrl || 
            relatedMemo.completedCommandUrl || 
            relatedMemo.dispatchBookUrl
        );
        
        const isFullyCompleted = relatedMemo && relatedMemo.status === 'เสร็จสิ้น/รับไฟล์ไปใช้งาน';
        
        return `
            <div class="border rounded-lg p-4 mb-4 bg-white shadow-sm ${isFullyCompleted ? 'border-green-300 bg-green-50' : ''}">
                <div class="flex justify-between items-start">
                    <div class="flex-1">
                        <div class="flex items-center gap-2 mb-2">
                            <h3 class="font-bold text-lg">${request.id || 'ไม่มีรหัส'}</h3>
                            ${isFullyCompleted ? `
                                <span class="bg-green-100 text-green-800 text-xs font-medium px-2.5 py-0.5 rounded-full">
                                    ✅ เสร็จสิ้นทั้งหมด
                                </span>
                            ` : ''}
                            ${relatedMemo && relatedMemo.status === 'นำกลับไปแก้ไข' ? `
                                <span class="bg-red-100 text-red-800 text-xs font-medium px-2.5 py-0.5 rounded-full">
                                    ⚠️ ต้องแก้ไข
                                </span>
                            ` : ''}
                        </div>
                        <p class="text-gray-600">${request.purpose || 'ไม่มีวัตถุประสงค์'}</p>
                        <p class="text-sm text-gray-500">สถานที่: ${request.location || 'ไม่ระบุ'} | วันที่: ${formatDisplayDate(request.startDate)} - ${formatDisplayDate(request.endDate)}</p>
                        
                        <div class="mt-2 space-y-1">
                            <p class="text-sm">
                                <span class="font-medium">สถานะคำขอ:</span> 
                                <span class="${getStatusColor(displayRequestStatus)}">${translateStatus(displayRequestStatus)}</span>
                            </p>
                            <p class="text-sm">
                                <span class="font-medium">สถานะคำสั่ง:</span> 
                                <span class="${getStatusColor(displayCommandStatus || 'กำลังดำเนินการ')}">${translateStatus(displayCommandStatus || 'กำลังดำเนินการ')}</span>
                            </p>
                            
                            ${relatedMemo ? `
                                <p class="text-sm">
                                    <span class="font-medium">สถานะบันทึก:</span> 
                                    <span class="${getStatusColor(relatedMemo.status)}">${translateStatus(relatedMemo.status)}</span>
                                </p>
                            ` : ''}
                        </div>
                        
                        ${hasCompletedFiles ? `
                            <div class="mt-3 p-3 bg-green-50 rounded-lg border border-green-200">
                                <p class="text-sm font-medium text-green-800 mb-2">📁 ไฟล์ที่พร้อมดาวน์โหลด:</p>
                                <div class="flex flex-wrap gap-2">
                                    ${relatedMemo.completedMemoUrl ? `
                                        <a href="${relatedMemo.completedMemoUrl}" target="_blank" class="btn btn-success btn-sm text-xs">
                                            📄 บันทึกข้อความสมบูรณ์
                                        </a>
                                    ` : ''}
                                    ${relatedMemo.completedCommandUrl ? `
                                        <a href="${relatedMemo.completedCommandUrl}" target="_blank" class="btn bg-blue-500 text-white btn-sm text-xs">
                                            📋 คำสั่งไปราชการสมบูรณ์
                                        </a>
                                    ` : ''}
                                    ${relatedMemo.dispatchBookUrl ? `
                                        <a href="${relatedMemo.dispatchBookUrl}" target="_blank" class="btn bg-purple-500 text-white btn-sm text-xs">
                                            📦 หนังสือส่งสมบูรณ์
                                        </a>
                                    ` : ''}
                                </div>
                                ${isFullyCompleted ? `
                                    <p class="text-xs text-green-600 mt-2">
                                        ✅ งานทั้งหมดเสร็จสมบูรณ์และพร้อมใช้งาน
                                    </p>
                                ` : ''}
                            </div>
                        ` : ''}
                    </div>
                    <div class="flex gap-2 flex-col ml-4">
                        ${request.pdfUrl ? `
                            <a href="${request.pdfUrl}" target="_blank" class="btn btn-success btn-sm">
                                📄 ดูคำขอ
                            </a>
                        ` : ''}
                        
                        ${!isFullyCompleted ? `
                            <button data-action="edit" data-id="${request.id}" class="btn bg-blue-500 text-white btn-sm">
                                ✏️ แก้ไข
                            </button>
                        ` : ''}
                        
                        ${!isFullyCompleted ? `
                            <button data-action="delete" data-id="${request.id}" class="btn btn-danger btn-sm">
                                🗑️ ลบ
                            </button>
                        ` : ''}
                        
                        ${!relatedMemo && !isFullyCompleted ? `
                            <button data-action="send-memo" data-id="${request.id}" class="btn bg-green-500 text-white btn-sm">
                                📤 ส่งบันทึก
                            </button>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;
    }).join('');

    container.classList.remove('hidden');
    noRequestsMessage.classList.add('hidden');

    // Add event listeners to action buttons
    container.addEventListener('click', handleRequestAction);
}

// ฟังก์ชันช่วยเหลือสำหรับสีสถานะ
function getStatusColor(status) {
    const statusColors = {
        'เสร็จสิ้น/รับไฟล์ไปใช้งาน': 'text-green-600 font-semibold',
        'เสร็จสิ้น': 'text-green-600 font-semibold',
        'Approved': 'text-green-600 font-semibold',
        'เสร็จสิ้นรอออกคำสั่งไปราชการ': 'text-blue-600',
        'กำลังดำเนินการ': 'text-yellow-600',
        'Pending': 'text-yellow-600',
        'Submitted': 'text-blue-600',
        'รอเอกสาร (เบิก)': 'text-orange-600',
        'นำกลับไปแก้ไข': 'text-red-600',
        'รอตรวจสอบและออกคำสั่งไปราชการ': 'text-purple-600'
    };
    return statusColors[status] || 'text-gray-600';
}

async function handleRequestAction(e) {
    const button = e.target.closest('button[data-action]');
    if (!button) return;

    const requestId = button.dataset.id;
    const action = button.dataset.action;

    console.log("Action triggered:", action, "Request ID:", requestId);

    if (action === 'edit') {
        console.log("🔄 Opening edit page for:", requestId);
        await openEditPage(requestId);
        
    } else if (action === 'delete') {
        console.log("🗑️ Deleting request:", requestId);
        await handleDeleteRequest(requestId);
        
    } else if (action === 'send-memo') {
        console.log("📤 Opening send memo modal for:", requestId);
        openSendMemoModal(requestId);
    }
}

// ✅ ฟังก์ชันลบคำขอ
async function handleDeleteRequest(requestId) {
    try {
        const user = getCurrentUser();
        if (!user) {
            showAlert('ผิดพลาด', 'กรุณาเข้าสู่ระบบใหม่');
            return;
        }

        const confirmed = await showConfirm(
            'ยืนยันการลบ', 
            `คุณแน่ใจหรือไม่ว่าต้องการลบคำขอ ${requestId}? การกระทำนี้ไม่สามารถย้อนกลับได้`
        );

        if (!confirmed) {
            console.log("User cancelled deletion");
            return;
        }

        console.log("Deleting request:", requestId, "by user:", user.username);

        const result = await apiCall('POST', 'deleteRequest', {
            requestId: requestId,
            username: user.username
        });

        if (result.status === 'success') {
            showAlert('สำเร็จ', 'ลบคำขอเรียบร้อยแล้ว');
            
            clearRequestsCache();
            await fetchUserRequests();
            
            if (document.getElementById('edit-page').classList.contains('hidden') === false) {
                switchPage('dashboard-page');
            }
            
        } else {
            showAlert('ผิดพลาด', result.message || 'ไม่สามารถลบคำขอได้');
        }

    } catch (error) {
        console.error('Error deleting request:', error);
        showAlert('ผิดพลาด', 'เกิดข้อผิดพลาดในการลบคำขอ: ' + error.message);
    }
}

// --- BASIC FORM FUNCTIONS ---

async function resetRequestForm() {
    const requestForm = document.getElementById('request-form');
    const formRequestId = document.getElementById('form-request-id');
    const formAttendeesList = document.getElementById('form-attendees-list');
    const formResult = document.getElementById('form-result');
    
    if (requestForm) requestForm.reset();
    if (formRequestId) formRequestId.value = '';
    if (formAttendeesList) formAttendeesList.innerHTML = '';
    if (formResult) formResult.classList.add('hidden');
    
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    
    const formDocDate = document.getElementById('form-doc-date');
    const formStartDate = document.getElementById('form-start-date');
    const formEndDate = document.getElementById('form-end-date');
    
    if (formDocDate) formDocDate.value = `${yyyy}-${mm}-${dd}`;
    if (formStartDate) formStartDate.value = `${yyyy}-${mm}-${dd}`;
    if (formEndDate) formEndDate.value = `${yyyy}-${mm}-${dd}`;
    
    // ✅ รีเซ็ตข้อมูลพาหนะ
    document.querySelectorAll('input[name="vehicle_option"]').forEach(checkbox => {
        checkbox.checked = false;
    });
    
    const privateVehicleDetails = document.getElementById('private-vehicle-details');
    const publicVehicleDetails = document.getElementById('public-vehicle-details');
    const formLicensePlate = document.getElementById('form-license-plate');
    const formOtherVehicle = document.getElementById('form-other-vehicle');
    
    if (privateVehicleDetails) privateVehicleDetails.classList.add('hidden');
    if (publicVehicleDetails) publicVehicleDetails.classList.add('hidden');
    if (formLicensePlate) formLicensePlate.value = '';
    if (formOtherVehicle) formOtherVehicle.value = '';
    
    const formDepartment = document.getElementById('form-department');
    if (formDepartment) {
        formDepartment.addEventListener('change', (e) => {
            const selectedDept = e.target.value;
            const headNameInput = document.getElementById('form-head-name');
            if (headNameInput) headNameInput.value = specialPositionMap[selectedDept] || '';
        });
    }
}

function addAttendeeField() {
    const list = document.getElementById('form-attendees-list');
    if (!list) return;
    
    const attendeeDiv = document.createElement('div');
    attendeeDiv.className = 'grid grid-cols-1 md:grid-cols-3 gap-2 items-center mb-2';
    attendeeDiv.innerHTML = `
        <input type="text" class="form-input attendee-name md:col-span-1" placeholder="ชื่อ-นามสกุล" required>
        <div class="attendee-position-wrapper md:col-span-1">
             <select class="form-input attendee-position-select">
                <option value="">-- เลือกตำแหน่ง --</option>
                <option value="ผู้อำนวยการ">ผู้อำนวยการ</option>
                <option value="รองผู้อำนวยการ">รองผู้อำนวยการ</option>
                <option value="ครู">ครู</option>
                <option value="ครูผู้ช่วย">ครูผู้ช่วย</option>
                <option value="พนักงานราชการ">พนักงานราชการ</option>
                <option value="ครูอัตราจ้าง">ครูอัตราจ้าง</option>
                <option value="พนักงานขับรถ">พนักงานขับรถ</option>
                <option value="นักเรียน">นักเรียน</option>
                <option value="other">อื่นๆ (โปรดระบุ)</option>
            </select>
            <input type="text" class="form-input attendee-position-other hidden mt-1" placeholder="ระบุตำแหน่ง">
        </div>
        <button type="button" class="btn btn-danger btn-sm" onclick="this.parentElement.remove()">ลบ</button>
    `;
    list.appendChild(attendeeDiv);
    
    const select = attendeeDiv.querySelector('.attendee-position-select');
    const otherInput = attendeeDiv.querySelector('.attendee-position-other');

    select.addEventListener('change', () => {
        otherInput.classList.toggle('hidden', select.value !== 'other');
    });
}

function toggleExpenseOptions() {
    const partialOptions = document.getElementById('partial-expense-options');
    const totalContainer = document.getElementById('total-expense-container');
    
    const expensePartial = document.getElementById('expense_partial');
    
    if (expensePartial?.checked) {
        if (partialOptions) partialOptions.classList.remove('hidden');
        if (totalContainer) totalContainer.classList.remove('hidden');
    } else {
        if (partialOptions) partialOptions.classList.add('hidden');
        if (totalContainer) totalContainer.classList.add('hidden');
    }
}

function toggleVehicleOptions() {
    const privateDetails = document.getElementById('private-vehicle-details');
    const publicDetails = document.getElementById('public-vehicle-details');
    
    const vehiclePrivate = document.getElementById('vehicle_private');
    const vehiclePublic = document.getElementById('vehicle_public');
    
    if (vehiclePrivate?.checked) {
        if (privateDetails) privateDetails.classList.remove('hidden');
    } else {
        if (privateDetails) privateDetails.classList.add('hidden');
    }
    
    if (vehiclePublic?.checked) {
        if (publicDetails) publicDetails.classList.remove('hidden');
    } else {
        if (publicDetails) publicDetails.classList.add('hidden');
    }
}

async function handleRequestFormSubmit(e) {
    if (e) e.preventDefault();
    
    const user = getCurrentUser();
    if (!user) {
        showAlert('ผิดพลาด', 'กรุณาเข้าสู่ระบบก่อน');
        return;
    }

    // ✅ ดึงข้อมูลพาหนะแบบใหม่
    const vehicleData = getVehicleDataFromForm();
    
    // ✅ ตรวจสอบว่ามีการเลือกพาหนะอย่างน้อย 1 อย่าง
    if (vehicleData.vehicleOptions.length === 0) {
        showAlert('ข้อมูลไม่ครบถ้วน', 'กรุณาเลือกพาหนะอย่างน้อย 1 ชนิด');
        return;
    }

    const formData = {
        username: user.username,
        docDate: document.getElementById('form-doc-date')?.value || '',
        requesterName: document.getElementById('form-requester-name')?.value || '',
        requesterPosition: document.getElementById('form-requester-position')?.value || '',
        location: document.getElementById('form-location')?.value || '',
        purpose: document.getElementById('form-purpose')?.value || '',
        startDate: document.getElementById('form-start-date')?.value || '',
        endDate: document.getElementById('form-end-date')?.value || '',
        attendees: Array.from(document.querySelectorAll('#form-attendees-list > div')).map(div => {
            const select = div.querySelector('.attendee-position-select');
            let position = select ? select.value : '';
            if (position === 'other') {
                const otherInput = div.querySelector('.attendee-position-other');
                position = otherInput ? otherInput.value : '';
            }
            return {
                name: div.querySelector('.attendee-name')?.value || '',
                position: position
            };
        }).filter(att => att.name && att.position),
        expenseOption: document.querySelector('input[name="expense_option"]:checked')?.value || 'no',
        expenseItems: [],
        totalExpense: document.getElementById('form-total-expense')?.value || 0,
        // ✅ ใช้ข้อมูลพาหนะแบบใหม่แทน vehicleOption เดิม
        vehicleOptions: vehicleData.vehicleOptions,
        vehicleDetails: vehicleData.vehicleDetails,
        department: document.getElementById('form-department')?.value || '',
        headName: document.getElementById('form-head-name')?.value || '',
        isEdit: false
    };

    if (formData.expenseOption === 'partial') {
        document.querySelectorAll('input[name="expense_item"]:checked').forEach(chk => {
            const item = { name: chk.dataset.itemName };
            if (item.name === 'ค่าใช้จ่ายอื่นๆ') {
                const otherText = document.getElementById('expense_other_text');
                if (otherText) item.detail = otherText.value;
            }
            formData.expenseItems.push(item);
        });
    }

    toggleLoader('submit-request-button', true);

    try {
        const result = await apiCall('POST', 'createRequest', formData);
        
        if (result.status === 'success') {
            const formResultTitle = document.getElementById('form-result-title');
            const formResultMessage = document.getElementById('form-result-message');
            const formResultLink = document.getElementById('form-result-link');
            const formResult = document.getElementById('form-result');
            
            if (formResultTitle) formResultTitle.textContent = 'สร้างเอกสารสำเร็จ!';
            if (formResultMessage) formResultMessage.textContent = `บันทึกข้อความสำหรับ ID ${result.data.id} ถูกสร้างแล้ว`;
            if (formResultLink) {
                formResultLink.href = result.data.pdfUrl;
                formResultLink.classList.remove('hidden');
            }
            if (formResult) formResult.classList.remove('hidden');
            
            const requestForm = document.getElementById('request-form');
            const formAttendeesList = document.getElementById('form-attendees-list');
            
            if (requestForm) requestForm.reset();
            if (formAttendeesList) formAttendeesList.innerHTML = '';
            
            clearRequestsCache();
            await fetchUserRequests();
        } else {
            showAlert('ผิดพลาด', result.message);
        }
    } catch (error) {
        showAlert('เกิดข้อผิดพลาด', 'ไม่สามารถสร้างเอกสารได้: ' + error.message);
    } finally {
        toggleLoader('submit-request-button', false);
    }
}

// --- BASIC ADMIN FUNCTIONS ---

async function fetchAllUsers() {
    try {
        if (!checkAdminAccess()) {
            showAlert('ผิดพลาด', 'คุณไม่มีสิทธิ์เข้าถึงหน้านี้');
            return;
        }

        const result = await apiCall('GET', 'getAllUsers');
        if (result.status === 'success') {
            allUsersCache = result.data || [];
            renderUsersList(allUsersCache);
        }
    } catch (error) {
        console.error('Error fetching users:', error);
        showAlert('ผิดพลาด', 'ไม่สามารถโหลดข้อมูลผู้ใช้ได้');
    }
}

function renderUsersList(users) {
    const container = document.getElementById('users-content');
    if (!container) return;
    
    if (!users || users.length === 0) {
        container.innerHTML = '<p class="text-center text-gray-500">ไม่พบข้อมูลผู้ใช้</p>';
        return;
    }

    container.innerHTML = `
        <div class="overflow-x-auto">
            <table class="min-w-full bg-white">
                <thead>
                    <tr class="bg-gray-100">
                        <th class="px-4 py-2 text-left">ชื่อผู้ใช้</th>
                        <th class="px-4 py-2 text-left">ชื่อ-นามสกุล</th>
                        <th class="px-4 py-2 text-left">อีเมล</th>
                        <th class="px-4 py-2 text-left">ตำแหน่ง</th>
                        <th class="px-4 py-2 text-left">กลุ่มสาระ/งาน</th>
                        <th class="px-4 py-2 text-left">บทบาท</th>
                        <th class="px-4 py-2 text-left">การจัดการ</th>
                    </tr>
                </thead>
                <tbody>
                    ${users.map(user => `
                        <tr class="border-b">
                            <td class="px-4 py-2">${user.username}</td>
                            <td class="px-4 py-2">${user.fullName}</td>
                            <td class="px-4 py-2">${user.email || 'N/A'}</td>
                            <td class="px-4 py-2">${user.position}</td>
                            <td class="px-4 py-2">${user.department}</td>
                            <td class="px-4 py-2">${user.role}</td>
                            <td class="px-4 py-2">
                                <button onclick="deleteUser('${user.username}')" class="btn btn-danger btn-sm">ลบ</button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
}

async function deleteUser(username) {
    const confirmed = await showConfirm("ยืนยันการลบ", `คุณแน่ใจหรือไม่ว่าต้องการลบผู้ใช้ ${username}?`);
    if (confirmed) {
        try {
            await apiCall('POST', 'deleteUser', { username });
            showAlert('สำเร็จ', 'ลบผู้ใช้สำเร็จ');
            await fetchAllUsers();
        } catch (error) {
            showAlert('ผิดพลาด', 'ไม่สามารถลบผู้ใช้ได้: ' + error.message);
        }
    }
}

function openAddUserModal() {
    const modal = document.getElementById('register-modal');
    if (modal) modal.style.display = 'flex';
}

function downloadUserTemplate() {
    const template = [
        ['Username', 'Password', 'FullName', 'Email', 'Position', 'Department', 'Role', 'SpecialPosition']
    ];
    
    if (typeof XLSX !== 'undefined') {
        const ws = XLSX.utils.aoa_to_sheet(template);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Template');
        XLSX.writeFile(wb, 'user_template.xlsx');
    } else {
        showAlert('ผิดพลาด', 'ไม่สามารถดาวน์โหลดเทมเพลตได้ กรุณาตรวจสอบไลบรารี XLSX');
    }
}

async function handleUserImport(e) {
    const file = e.target.files[0];
    if (!file) return;

    try {
        if (typeof XLSX === 'undefined') {
            throw new Error('XLSX library not available');
        }
        
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data);
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(worksheet);

        const result = await apiCall('POST', 'importUsers', { users: jsonData });
        
        if (result.status === 'success') {
            showAlert('สำเร็จ', result.message);
            await fetchAllUsers();
        } else {
            showAlert('ผิดพลาด', result.message);
        }
    } catch (error) {
        showAlert('ผิดพลาด', 'เกิดข้อผิดพลาดในการนำเข้าข้อมูล: ' + error.message);
    } finally {
        e.target.value = '';
    }
}

// --- MEMO FUNCTIONS ---

async function handleMemoSubmitFromModal(e) {
    if (e) e.preventDefault();
    
    const user = getCurrentUser();
    if (!user) {
        showAlert('ผิดพลาด', 'กรุณาเข้าสู่ระบบใหม่');
        return;
    }

    const requestId = document.getElementById('memo-modal-request-id')?.value;
    const memoType = document.querySelector('input[name="modal_memo_type"]:checked')?.value;
    const fileInput = document.getElementById('modal-memo-file');
    
    if (!requestId) {
        showAlert('ผิดพลาด', 'ไม่พบรหัสคำขอ');
        return;
    }

    let fileObject = null;
    if (memoType === 'non_reimburse') {
        if (!fileInput || fileInput.files.length === 0) {
            showAlert('ผิดพลาด', 'กรุณาเลือกไฟล์บันทึกข้อความสำหรับประเภทไม่เบิกค่าใช้จ่าย');
            return;
        }
        try {
            fileObject = await fileToObject(fileInput.files[0]);
        } catch (error) {
            showAlert('ผิดพลาด', 'ไม่สามารถอ่านไฟล์: ' + error.message);
            return;
        }
    }

    toggleLoader('send-memo-submit-button', true);

    try {
        const result = await apiCall('POST', 'submitMemo', {
            refNumber: requestId,
            file: fileObject,
            username: user.username,
            memoType: memoType,
            submittedBy: user.fullName || user.username
        });
        
        if (result.status === 'success') {
            showAlert('สำเร็จ', 'ส่งบันทึกข้อความสำเร็จ');
            const modal = document.getElementById('send-memo-modal');
            if (modal) modal.style.display = 'none';
            
            const form = document.getElementById('send-memo-form');
            if (form) form.reset();
            
            clearRequestsCache();
            await fetchUserRequests();
        } else {
            showAlert('ผิดพลาด', result.message || 'ไม่สามารถส่งบันทึกข้อความได้');
        }
    } catch (error) {
        console.error('Memo submission error:', error);
        showAlert('ผิดพลาด', 'เกิดข้อผิดพลาดในการส่งบันทึกข้อความ: ' + error.message);
    } finally {
        toggleLoader('send-memo-submit-button', false);
    }
}

// --- STATS FUNCTIONS ---

async function loadStatsData() {
    try {
        console.log("🔄 Loading stats data...");
        
        const user = getCurrentUser();
        if (!user) {
            console.error("❌ No user found!");
            return;
        }

        const container = document.getElementById('stats-overview');
        if (container) {
            container.innerHTML = `
                <div class="text-center p-8">
                    <div class="loader mx-auto"></div>
                    <p class="mt-4">กำลังโหลดสถิติ...</p>
                </div>
            `;
        }

        const chartsSection = document.getElementById('stats-charts');
        if (chartsSection) {
            chartsSection.classList.add('hidden');
        }

        const [requestsResult, memosResult, usersResult] = await Promise.all([
            apiCall('GET', 'getAllRequests').catch(err => {
                console.error("Error loading requests:", err);
                return { status: 'success', data: [] };
            }),
            apiCall('GET', 'getAllMemos').catch(err => {
                console.error("Error loading memos:", err);
                return { status: 'success', data: [] };
            }),
            apiCall('GET', 'getAllUsers').catch(err => {
                console.error("Error loading users:", err);
                return { status: 'success', data: [] };
            })
        ]);

        console.log("📥 API Results:", {
            requests: requestsResult?.data?.length,
            memos: memosResult?.data?.length, 
            users: usersResult?.data?.length
        });

        const requests = requestsResult?.data || [];
        const memos = memosResult?.data || [];
        const users = usersResult?.data || [];

        const userRequests = user.role === 'admin' ? requests : requests.filter(req => req.username === user.username);
        const userMemos = user.role === 'admin' ? memos : memos.filter(memo => memo.submittedBy === user.username);

        console.log("📊 Filtered data:", {
            userRequests: userRequests.length,
            userMemos: userMemos.length,
            users: users.length
        });

        renderStatsOverview(userRequests, userMemos, users, user);
        
    } catch (error) {
        console.error('❌ Error loading stats:', error);
        const container = document.getElementById('stats-overview');
        if (container) {
            container.innerHTML = `
                <div class="text-center p-8 text-red-500">
                    <p>เกิดข้อผิดพลาดในการโหลดสถิติ: ${error.message}</p>
                    <button onclick="loadStatsData()" class="btn btn-primary mt-4">ลองอีกครั้ง</button>
                </div>
            `;
        }
    }
}

function renderStatsOverview(requests, memos, users, currentUser) {
    const container = document.getElementById('stats-overview');
    if (!container) return;
    
    const stats = calculateStats(requests, memos, users, currentUser);
    
    container.innerHTML = `
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div class="stat-card bg-white rounded-lg shadow p-4 border-l-4 border-blue-500">
                <div class="flex items-center">
                    <div class="bg-blue-100 p-3 rounded-lg">
                        <svg class="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"></path></svg>
                    </div>
                    <div class="ml-4">
                        <p class="text-sm font-medium text-gray-600">คำขอทั้งหมด</p>
                        <p class="text-2xl font-bold text-gray-900">${stats.totalRequests}</p>
                    </div>
                </div>
            </div>
            <div class="stat-card bg-white rounded-lg shadow p-4 border-l-4 border-green-500">
                <div class="flex items-center">
                    <div class="bg-green-100 p-3 rounded-lg">
                        <svg class="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                    </div>
                    <div class="ml-4">
                        <p class="text-sm font-medium text-gray-600">คำขอที่เสร็จสิ้น</p>
                        <p class="text-2xl font-bold text-gray-900">${stats.completedRequests}</p>
                    </div>
                </div>
            </div>
            <div class="stat-card bg-white rounded-lg shadow p-4 border-l-4 border-purple-500">
                <div class="flex items-center">
                    <div class="bg-purple-100 p-3 rounded-lg">
                        <svg class="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                    </div>
                    <div class="ml-4">
                        <p class="text-sm font-medium text-gray-600">บันทึกข้อความ</p>
                        <p class="text-2xl font-bold text-gray-900">${stats.totalMemos}</p>
                    </div>
                </div>
            </div>
            <div class="stat-card bg-white rounded-lg shadow p-4 border-l-4 border-yellow-500">
                <div class="flex items-center">
                    <div class="bg-yellow-100 p-3 rounded-lg">
                        <svg class="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z"></path></svg>
                    </div>
                    <div class="ml-4">
                        <p class="text-sm font-medium text-gray-600">ผู้ใช้ทั้งหมด</p>
                        <p class="text-2xl font-bold text-gray-900">${stats.totalUsers}</p>
                    </div>
                </div>
            </div>
        </div>

        <div id="stats-charts" class="mt-8">
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div class="chart-container" style="position: relative; height: 300px;">
                    <h3 class="text-lg font-bold mb-4 text-gray-800">คำขอรายเดือน (6 เดือนล่าสุด)</h3>
                    <canvas id="requests-chart"></canvas>
                </div>
                <div class="chart-container" style="position: relative; height: 300px;">
                    <h3 class="text-lg font-bold mb-4 text-gray-800">สรุปสถานะคำขอ</h3>
                    <canvas id="status-chart"></canvas>
                </div>
            </div>
        </div>
    `;

    if (window.requestsChartInstance) {
        window.requestsChartInstance.destroy();
        window.requestsChartInstance = null;
    }
    if (window.statusChartInstance) {
        window.statusChartInstance.destroy();
        window.statusChartInstance = null;
    }

    setTimeout(() => {
        createCharts(stats);
    }, 100);
}

function createCharts(stats) {
    console.log("📊 Creating charts with data:", stats);
    
    const monthlyCtx = document.getElementById('requests-chart');
    if (monthlyCtx) {
        const monthlyLabels = stats.monthlyStats.map(m => m.month);
        const monthlyData = stats.monthlyStats.map(m => m.count);

        console.log("📈 Monthly chart data:", { labels: monthlyLabels, data: monthlyData });

        window.requestsChartInstance = new Chart(monthlyCtx, {
            type: 'bar',
            data: {
                labels: monthlyLabels,
                datasets: [{
                    label: 'จำนวนคำขอ',
                    data: monthlyData,
                    backgroundColor: 'rgba(79, 70, 229, 0.6)',
                    borderColor: 'rgba(79, 70, 229, 1)',
                    borderWidth: 1,
                    borderRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { 
                        display: false 
                    },
                    tooltip: {
                        callbacks: {
                            title: (tooltipItems) => `เดือน ${tooltipItems[0].label}`,
                            label: (tooltipItem) =>  `${tooltipItem.raw} คำขอ`
                        }
                    }
                },
                scales: {
                    y: { 
                        beginAtZero: true,
                        ticks: {
                            precision: 0
                        },
                        grid: { 
                            color: 'rgba(229, 231, 235, 0.5)' 
                        }
                    },
                    x: { 
                        grid: { 
                            display: false 
                        }
                    }
                }
            }
        });
        
        console.log("✅ Monthly chart created successfully");
    } else {
        console.error("❌ Could not find requests-chart canvas");
    }

    const statusCtx = document.getElementById('status-chart');
    if (statusCtx) {
        const statusEntries = Object.entries(stats.requestStatus);
        const statusLabels = statusEntries.map(([status, count]) => `${translateStatus(status)} (${count})`);
        const statusData = statusEntries.map(([status, count]) => count);
        
        const statusColors = [
            'rgba(22, 163, 74, 0.7)',
            'rgba(59, 130, 246, 0.7)',
            'rgba(245, 158, 11, 0.7)',
            'rgba(239, 68, 68, 0.7)',
            'rgba(168, 85, 247, 0.7)',
            'rgba(249, 115, 22, 0.7)'
        ];

        console.log("📊 Status chart data:", { labels: statusLabels, data: statusData });

        window.statusChartInstance = new Chart(statusCtx, {
            type: 'doughnut',
            data: {
                labels: statusLabels,
                datasets: [{
                    data: statusData,
                    backgroundColor: statusColors.slice(0, statusData.length),
                    borderColor: 'rgba(255, 255, 255, 0.8)',
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { 
                        position: 'bottom', 
                        labels: { 
                            padding: 15,
                            usePointStyle: true,
                            font: {
                                size: 12
                            }
                        } 
                    },
                    tooltip: {
                        callbacks: {
                            label: (tooltipItem) => {
                                const label = tooltipItem.label || '';
                                const value = tooltipItem.raw || 0;
                                return `${label.split(' (')[0]}: ${value} คำขอ`;
                            }
                        }
                    }
                },
                cutout: '50%'
            }
        });
        
        console.log("✅ Status chart created successfully");
    } else {
        console.error("❌ Could not find status-chart canvas");
    }

    const chartsSection = document.getElementById('stats-charts');
    if (chartsSection) {
        chartsSection.classList.remove('hidden');
        console.log("✅ Charts section displayed");
    }
}

function calculateStats(requests, memos, users, currentUser) {
    const totalRequests = requests.length;
    const totalMemos = memos.length;
    const totalUsers = users.length;

    const requestStatus = {};
    requests.forEach(req => {
        const status = req.status || 'กำลังดำเนินการ';
        requestStatus[status] = (requestStatus[status] || 0) + 1;
    });

    const completedRequests = requests.filter(req => 
        req.status === 'เสร็จสิ้น/รับไฟล์ไปใช้งาน' || 
        req.status === 'Approved' ||
        req.commandStatus === 'เสร็จสิ้นรอออกคำสั่งไปราชการ'
    ).length;

    const departmentStats = {};
    requests.forEach(req => {
        const dept = req.department || 'ไม่ระบุแผนก';
        departmentStats[dept] = (departmentStats[dept] || 0) + 1;
    });

    const userStats = {
        total: users.length,
        admins: users.filter(u => u.role === 'admin').length,
        regularUsers: users.filter(u => u.role === 'user').length
    };

    const monthlyStats = calculateMonthlyStats(requests);

    return {
        totalRequests,
        completedRequests,
        totalMemos,
        totalUsers,
        requestStatus,
        departmentStats,
        userStats,
        monthlyStats
    };
}

function calculateMonthlyStats(requests) {
    const months = [];
    const now = new Date();
    
    for (let i = 5; i >= 0; i--) {
        const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const monthKey = date.toLocaleDateString('th-TH', { year: 'numeric', month: 'long' });
        
        const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
        const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0);
        
        const monthRequests = requests.filter(req => {
            const dateString = req.timestamp || req.startDate || req.docDate || req.createdAt;
            if (!dateString) return false;
            
            try {
                const reqDate = new Date(dateString);
                if (isNaN(reqDate.getTime())) return false;
                
                return reqDate >= monthStart && reqDate <= monthEnd;
            } catch (e) {
                return false;
            }
        });
        
        const completedRequests = monthRequests.filter(req => 
            req.status === 'เสร็จสิ้น/รับไฟล์ไปใช้งาน' || 
            req.status === 'Approved' ||
            req.status === 'เสร็จสิ้น'
        ).length;
        
        months.push({
            month: monthKey,
            count: monthRequests.length,
            completed: completedRequests
        });
    }
    
    return months;
}

function debugChartCreation() {
    console.log('=== CHART CREATION DEBUG ===');
    
    const requestsChart = document.getElementById('requests-chart');
    const statusChart = document.getElementById('status-chart');
    const chartsSection = document.getElementById('stats-charts');
    
    console.log('requests-chart element:', requestsChart);
    console.log('status-chart element:', statusChart);
    console.log('charts-section:', chartsSection);
    
    if (requestsChart) {
        console.log('requests-chart dimensions:', {
            offsetWidth: requestsChart.offsetWidth,
            offsetHeight: requestsChart.offsetHeight,
            clientWidth: requestsChart.clientWidth,
            clientHeight: requestsChart.clientHeight
        });
    }
    
    console.log('Chart instances:', {
        requestsChartInstance: window.requestsChartInstance,
        statusChartInstance: window.statusChartInstance
    });
}

window.debugChartCreation = debugChartCreation;

// --- TEMPLATE FUNCTIONS ---

function downloadAttendeeTemplate() {
    const template = [
        ['ชื่อ-นามสกุล', 'ตำแหน่ง'],
        ['ตัวอย่าง ผู้ใช้', 'ครู'],
        ['ตัวอย่าง ผู้ใช้2', 'นักเรียน']
    ];
    
    if (typeof XLSX !== 'undefined') {
        const ws = XLSX.utils.aoa_to_sheet(template);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Template');
        XLSX.writeFile(wb, 'attendee_template.xlsx');
    } else {
        showAlert('ผิดพลาด', 'ไม่สามารถดาวน์โหลดเทมเพลตได้ กรุณาตรวจสอบไลบรารี XLSX');
    }
}

async function handleExcelImport(e) {
    const file = e.target.files[0];
    if (!file) return;

    try {
        if (typeof XLSX === 'undefined') {
            throw new Error('XLSX library not available');
        }
        
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data);
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(worksheet);

        const attendeesList = document.getElementById('form-attendees-list');
        if (attendeesList) attendeesList.innerHTML = '';

        jsonData.forEach(row => {
            if (row['ชื่อ-นามสกุล'] && row['ตำแหน่ง']) {
                addAttendeeFieldWithData(row['ชื่อ-นามสกุล'], row['ตำแหน่ง']);
            }
        });

        showAlert('สำเร็จ', 'นำเข้าข้อมูลผู้ร่วมเดินทางสำเร็จ');
    } catch (error) {
        showAlert('ผิดพลาด', 'เกิดข้อผิดพลาดในการนำเข้าข้อมูล: ' + error.message);
    } finally {
        e.target.value = '';
    }
}

function addAttendeeFieldWithData(name, position) {
    const list = document.getElementById('form-attendees-list');
    if (!list) return;
    
    const attendeeDiv = document.createElement('div');
    attendeeDiv.className = 'grid grid-cols-1 md:grid-cols-3 gap-2 items-center mb-2';
    
    attendeeDiv.innerHTML = `
        <input type="text" class="form-input attendee-name md:col-span-1" placeholder="ชื่อ-นามสกุล" value="${name}" required>
        <div class="attendee-position-wrapper md:col-span-1">
            <select class="form-input attendee-position-select">
                <option value="">-- เลือกตำแหน่ง --</option>
                <option value="ผู้อำนวยการ">ผู้อำนวยการ</option>
                <option value="รองผู้อำนวยการ">รองผู้อำนวยการ</option>
                <option value="ครู">ครู</option>
                <option value="ครูผู้ช่วย">ครูผู้ช่วย</option>
                <option value="พนักงานราชการ">พนักงานราชการ</option>
                <option value="ครูอัตราจ้าง">ครูอัตราจ้าง</option>
                <option value="พนักงานขับรถ">พนักงานขับรถ</option>
                <option value="นักเรียน">นักเรียน</option>
                <option value="other">อื่นๆ (โปรดระบุ)</option>
            </select>
            <input type="text" class="form-input attendee-position-other hidden mt-1" placeholder="ระบุตำแหน่ง" value="${position}">
        </div>
        <button type="button" class="btn btn-danger btn-sm" onclick="this.parentElement.remove()">ลบ</button>
    `;
    list.appendChild(attendeeDiv);
    
    const select = attendeeDiv.querySelector('.attendee-position-select');
    const otherInput = attendeeDiv.querySelector('.attendee-position-other');

    const optionExists = Array.from(select.options).some(opt => opt.value === position);
    if (optionExists) {
        select.value = position;
    } else {
        select.value = 'other';
        otherInput.classList.remove('hidden');
    }

    select.addEventListener('change', () => {
        otherInput.classList.toggle('hidden', select.value !== 'other');
    });
}

// --- ADMIN COMMAND FUNCTIONS ---

async function fetchAllRequestsForCommand() {
    try {
        if (!checkAdminAccess()) {
            showAlert('ผิดพลาด', 'คุณไม่มีสิทธิ์เข้าถึงหน้านี้');
            return;
        }

        const result = await apiCall('GET', 'getAllRequests');
        if (result.status === 'success') {
            allRequestsCache = result.data || [];
            renderAdminRequestsList(allRequestsCache);
        }
    } catch (error) {
        console.error('Error fetching requests for command:', error);
        showAlert('ผิดพลาด', 'ไม่สามารถโหลดข้อมูลคำขอได้');
    }
}

function renderAdminRequestsList(requests) {
    const container = document.getElementById('admin-requests-list');
    if (!container) return;
    
    if (!requests || requests.length === 0) {
        container.innerHTML = '<p class="text-center text-gray-500">ไม่พบคำขอไปราชการ</p>';
        return;
    }

    container.innerHTML = requests.map(request => {
        const peopleInfo = calculatePeopleCount(request);
        const hasCommand = request.commandPdfUrlSolo || request.commandPdfUrlGroupSmall || request.commandPdfUrlGroupLarge;
        const hasDispatch = request.dispatchBookPdfUrl;
        
        return `
            <div class="border rounded-lg p-4 bg-white mb-4">
                <div class="flex justify-between items-start">
                    <div class="flex-1">
                        <h4 class="font-bold text-indigo-700">${request.id || 'ไม่มีรหัส'}</h4>
                        <p class="text-sm text-gray-600">โดย: ${request.requesterName} | ${request.purpose}</p>
                        <p class="text-sm text-gray-500">${request.location} | ${formatDisplayDate(request.startDate)} - ${formatDisplayDate(request.endDate)}</p>
                        
                        <div class="mt-2">
                            <p class="text-sm font-medium text-blue-700">
                                👥 รวมทั้งหมด: ${peopleInfo.total} คน 
                                (${peopleInfo.category === 'solo' ? 'คำสั่งเดี่ยว' : 
                                  peopleInfo.category === 'groupSmall' ? 'คำสั่งกลุ่มเล็ก' : 'คำสั่งกลุ่มใหญ่'})
                            </p>
                        </div>

                        <div class="mt-2 space-y-1">
                            <p class="text-sm">สถานะคำขอ: <span class="font-medium ${getStatusColor(request.status)}">${translateStatus(request.status)}</span></p>
                            <p class="text-sm">สถานะคำสั่ง: <span class="font-medium">${request.commandStatus || 'รอดำเนินการ'}</span></p>
                        </div>

                        ${hasCommand || hasDispatch ? `
                            <div class="mt-3 p-2 bg-gray-50 rounded">
                                ${hasCommand ? '<p class="text-xs text-green-600">✓ มีคำสั่งแล้ว</p>' : ''}
                                ${hasDispatch ? '<p class="text-xs text-blue-600">✓ มีหนังสือส่งแล้ว</p>' : ''}
                            </div>
                        ` : ''}
                    </div>

                    <div class="flex flex-col gap-2 ml-4">
                        ${request.pdfUrl ? 
                            `<a href="${request.pdfUrl}" target="_blank" class="btn btn-success btn-sm">ดูคำขอ</a>` : ''}

                        ${hasCommand ? `
                            <div class="flex gap-1">
                                ${request.commandPdfUrlSolo ? `<a href="${request.commandPdfUrlSolo}" target="_blank" class="btn bg-blue-500 text-white btn-sm">คำสั่งเดี่ยว</a>` : ''}
                                ${request.commandPdfUrlGroupSmall ? `<a href="${request.commandPdfUrlGroupSmall}" target="_blank" class="btn bg-blue-500 text-white btn-sm">คำสั่งกลุ่มเล็ก</a>` : ''}
                                ${request.commandPdfUrlGroupLarge ? `<a href="${request.commandPdfUrlGroupLarge}" target="_blank" class="btn bg-blue-500 text-white btn-sm">คำสั่งกลุ่มใหญ่</a>` : ''}
                            </div>
                        ` : `
                            <button data-request-id="${request.id}" 
                                    class="btn bg-green-500 text-white btn-sm command-button">
                                ออกคำสั่ง
                            </button>
                        `}
                        
                        ${hasDispatch ? `
                            <a href="${request.dispatchBookPdfUrl}" target="_blank" class="btn bg-purple-500 text-white btn-sm">
                                ดูหนังสือส่ง
                            </a>
                        ` : `
                            <button data-request-id="${request.id}" 
                                    class="btn bg-orange-500 text-white btn-sm dispatch-button">
                                ออกหนังสือส่ง
                            </button>
                        `}
                    </div>
                </div>
            </div>
        `;
    }).join('');

    // ✅ เพิ่ม Event Listeners สำหรับปุ่มต่างๆ หลังจาก render
    setTimeout(() => {
        // ปุ่มออกหนังสือส่ง
        const dispatchButtons = document.querySelectorAll('.dispatch-button');
        console.log(`🔍 Found ${dispatchButtons.length} dispatch buttons`);
        
        dispatchButtons.forEach(button => {
            button.addEventListener('click', function() {
                const requestId = this.getAttribute('data-request-id');
                console.log("🖱️ Dispatch button clicked for:", requestId);
                if (requestId) {
                    openDispatchModal(requestId);
                }
            });
        });
        
        // ปุ่มออกคำสั่ง
        const commandButtons = document.querySelectorAll('.command-button');
        commandButtons.forEach(button => {
            button.addEventListener('click', function() {
                const requestId = this.getAttribute('data-request-id');
                console.log("🖱️ Command button clicked for:", requestId);
                if (requestId) {
                    openCommandApproval(requestId);
                }
            });
        });
    }, 100);
}

async function fetchAllMemos() {
    try {
        if (!checkAdminAccess()) {
            showAlert('ผิดพลาด', 'คุณไม่มีสิทธิ์เข้าถึงหน้านี้');
            return;
        }

        const result = await apiCall('GET', 'getAllMemos');
        if (result.status === 'success') {
            renderAdminMemosList(result.data);
        }
    } catch (error) {
        console.error('Error fetching memos:', error);
        showAlert('ผิดพลาด', 'ไม่สามารถโหลดข้อมูลบันทึกข้อความได้');
    }
}

function renderAdminMemosList(memos) {
    const container = document.getElementById('admin-memos-list');
    if (!container) return;
    
    if (!memos || memos.length === 0) {
        container.innerHTML = '<p class="text-center text-gray-500">ไม่พบบันทึกข้อความ</p>';
        return;
    }

    container.innerHTML = memos.map(memo => {
        const hasCompletedFiles = memo.completedMemoUrl || memo.completedCommandUrl || memo.dispatchBookUrl;
        
        return `
            <div class="border rounded-lg p-4 bg-white">
                <div class="flex justify-between items-start">
                    <div class="flex-1">
                        <h4 class="font-bold">${memo.id}</h4>
                        <p class="text-sm text-gray-600">โดย: ${memo.submittedBy} | อ้างอิง: ${memo.refNumber}</p>
                        <p class="text-sm">สถานะ: <span class="font-medium">${translateStatus(memo.status)}</span></p>
                        <div class="mt-2 text-xs text-gray-500">
                            ${memo.completedMemoUrl ? `<div>✓ บันทึกข้อความสมบูรณ์</div>` : ''}
                            ${memo.completedCommandUrl ? `<div>✓ คำสั่งสมบูรณ์</div>` : ''}
                            ${memo.dispatchBookUrl ? `<div>✓ หนังสือส่งสมบูรณ์</div>` : ''}
                        </div>
                    </div>
                    <div class="flex flex-col gap-2">
                        ${memo.fileURL ? `<a href="${memo.fileURL}" target="_blank" class="btn btn-success btn-sm">ดูไฟล์ต้นทาง</a>` : ''}
                        ${memo.completedMemoUrl ? `<a href="${memo.completedMemoUrl}" target="_blank" class="btn bg-blue-500 text-white btn-sm">ดูบันทึกสมบูรณ์</a>` : ''}
                        ${memo.completedCommandUrl ? `<a href="${memo.completedCommandUrl}" target="_blank" class="btn bg-blue-500 text-white btn-sm">ดูคำสั่งสมบูรณ์</a>` : ''}
                        ${memo.dispatchBookUrl ? `<a href="${memo.dispatchBookUrl}" target="_blank" class="btn bg-purple-500 text-white btn-sm">ดูหนังสือส่ง</a>` : ''}
                        
                        <button onclick="openAdminMemoAction('${memo.id}')" class="btn bg-green-500 text-white btn-sm">
                            ${hasCompletedFiles ? 'จัดการไฟล์' : 'อัพโหลดไฟล์'}
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// ฟังก์ชันเปิด Modal อนุมัติคำสั่ง
function openCommandApproval(requestId) {
    if (!checkAdminAccess()) {
        showAlert('ผิดพลาด', 'คุณไม่มีสิทธิ์ใช้งานฟังก์ชันนี้');
        return;
    }
    const commandRequestId = document.getElementById('command-request-id');
    const modal = document.getElementById('command-approval-modal');
    
    if (commandRequestId) commandRequestId.value = requestId;
    if (modal) modal.style.display = 'flex';
}

// ✅ ฟังก์ชันเปิด Modal หนังสือส่ง (เวอร์ชันแก้ไข)
function openDispatchModal(requestId) {
    console.log("🔧 openDispatchModal called with requestId:", requestId);
    
    if (!checkAdminAccess()) {
        console.error("❌ Admin access denied");
        showAlert('ผิดพลาด', 'คุณไม่มีสิทธิ์ใช้งานฟังก์ชันนี้');
        return;
    }
    
    if (!requestId) {
        console.error("❌ No requestId provided");
        showAlert('ผิดพลาด', 'ไม่พบรหัสคำขอ');
        return;
    }
    
    const requestIdInput = document.getElementById('dispatch-request-id');
    const yearInput = document.getElementById('dispatch-year');
    const modal = document.getElementById('dispatch-modal');
    
    console.log("🔍 Elements check:", {
        requestIdInput: !!requestIdInput,
        yearInput: !!yearInput,
        modal: !!modal
    });
    
    if (!requestIdInput || !yearInput || !modal) {
        console.error("❌ Required elements not found");
        showAlert('ระบบผิดพลาด', 'ไม่พบองค์ประกอบที่จำเป็นในหน้า');
        return;
    }
    
    // ตั้งค่าข้อมูลในฟอร์ม
    requestIdInput.value = requestId;
    
    // ตั้งค่าปีปัจจุบัน (พ.ศ.)
    const currentYear = new Date().getFullYear() + 543;
    yearInput.value = currentYear;
    
    // รีเซ็ตค่าอื่นๆ
    const dispatchMonth = document.getElementById('dispatch-month');
    const commandCount = document.getElementById('command-count');
    const memoCount = document.getElementById('memo-count');
    
    if (dispatchMonth) dispatchMonth.value = '';
    if (commandCount) commandCount.value = '';
    if (memoCount) memoCount.value = '';
    
    // แสดง modal
    modal.style.display = 'flex';
    
    console.log("✅ Dispatch modal opened successfully for request:", requestId);
}

// ✅ ฟังก์ชันตรวจสอบสถานะ Modal หนังสือส่ง
function checkDispatchModalStatus() {
    console.log("🔍 Dispatch Modal Status Check:");
    
    const modal = document.getElementById('dispatch-modal');
    const form = document.getElementById('dispatch-form');
    const requestIdInput = document.getElementById('dispatch-request-id');
    
    console.log("Modal element:", modal);
    console.log("Modal display style:", modal?.style.display);
    console.log("Modal class list:", modal?.classList);
    console.log("Form element:", form);
    console.log("Request ID input:", requestIdInput);
    
    // ตรวจสอบ Event Listeners
    const submitButton = document.getElementById('dispatch-submit-button');
    console.log("Submit button:", submitButton);
    
    if (submitButton) {
        const hasEventListener = !!submitButton.onclick;
        console.log("Submit button has click event:", hasEventListener);
    }
}

// ✅ ฟังก์ชันซ่อมแซม Modal หนังสือส่ง
function repairDispatchModal() {
    console.log("🔧 Repairing dispatch modal...");
    
    const modal = document.getElementById('dispatch-modal');
    const form = document.getElementById('dispatch-form');
    
    if (!modal || !form) {
        console.error("❌ Modal or form not found");
        return false;
    }
    
    // ลบ event listeners เดิม
    const newForm = form.cloneNode(true);
    form.parentNode.replaceChild(newForm, form);
    
    // เพิ่ม event listeners ใหม่
    document.getElementById('dispatch-form').addEventListener('submit', handleDispatchFormSubmit);
    
    // เพิ่ม event listeners สำหรับปุ่มปิด
    const closeButton = document.getElementById('dispatch-modal-close-button');
    const cancelButton = document.getElementById('dispatch-cancel-button');
    
    if (closeButton) {
        closeButton.addEventListener('click', () => {
            document.getElementById('dispatch-modal').style.display = 'none';
        });
    }
    
    if (cancelButton) {
        cancelButton.addEventListener('click', () => {
            document.getElementById('dispatch-modal').style.display = 'none';
        });
    }
    
    console.log("✅ Dispatch modal repaired successfully");
    return true;
}

// ✅ ฟังก์ชันทดสอบ Modal หนังสือส่ง
function testDispatchModal() {
    console.log("🧪 Testing Dispatch Modal...");
    
    // ตรวจสอบ element ต่างๆ
    checkDispatchModalStatus();
    
    // พยายามเปิด modal ด้วย requestId ตัวอย่าง
    const sampleRequest = allRequestsCache[0];
    if (sampleRequest) {
        console.log("🔄 Trying to open modal with sample request:", sampleRequest.id);
        openDispatchModal(sampleRequest.id);
    } else {
        console.log("ℹ️ No sample request available for testing");
    }
    
    // พยายามซ่อมแซม modal
    repairDispatchModal();
}

// ฟังก์ชันเปิด Modal จัดการบันทึกข้อความ
function openAdminMemoAction(memoId) {
    if (!checkAdminAccess()) {
        showAlert('ผิดพลาด', 'คุณไม่มีสิทธิ์ใช้งานฟังก์ชันนี้');
        return;
    }
    const adminMemoId = document.getElementById('admin-memo-id');
    const modal = document.getElementById('admin-memo-action-modal');
    
    if (adminMemoId) adminMemoId.value = memoId;
    if (modal) modal.style.display = 'flex';
}

// ฟังก์ชันอนุมัติคำสั่ง
async function handleCommandApproval(e) {
    if (e) e.preventDefault();
    
    const requestId = document.getElementById('command-request-id')?.value;
    const commandType = document.querySelector('input[name="command_type"]:checked')?.value;
    
    if (!commandType) {
        showAlert('ผิดพลาด', 'กรุณาเลือกรูปแบบคำสั่ง');
        return;
    }

    toggleLoader('command-approval-submit-button', true);

    try {
        const result = await apiCall('POST', 'generateCommand', {
            requestId: requestId,
            commandType: commandType,
            generatedBy: getCurrentUser().username
        });
        
        if (result.status === 'success') {
            showAlert('สำเร็จ', 'สร้างคำสั่งเรียบร้อยแล้ว');
            const modal = document.getElementById('command-approval-modal');
            if (modal) modal.style.display = 'none';
            
            const form = document.getElementById('command-approval-form');
            if (form) form.reset();
            
            clearRequestsCache();
            await fetchAllRequestsForCommand();
        } else {
            showAlert('ผิดพลาด', result.message || 'ไม่สามารถสร้างคำสั่งได้');
        }
    } catch (error) {
        console.error('Command approval error:', error);
        showAlert('ผิดพลาด', 'เกิดข้อผิดพลาดในการสร้างคำสั่ง: ' + error.message);
    } finally {
        toggleLoader('command-approval-submit-button', false);
    }
}

// ✅ แก้ไขฟังก์ชัน handleDispatchFormSubmit ให้ถูกต้อง
async function handleDispatchFormSubmit(e) {
    if (e) e.preventDefault();
    console.log("📦 handleDispatchFormSubmit called");
    
    const requestId = document.getElementById('dispatch-request-id')?.value;
    const dispatchMonth = document.getElementById('dispatch-month')?.value;
    const dispatchYear = document.getElementById('dispatch-year')?.value;
    const commandCount = document.getElementById('command-count')?.value;
    const memoCount = document.getElementById('memo-count')?.value;

    console.log("📋 Form data:", {
        requestId, dispatchMonth, dispatchYear, commandCount, memoCount
    });

    if (!dispatchMonth || !dispatchYear || !commandCount || !memoCount) {
        showAlert('ผิดพลาด', 'กรุณากรอกข้อมูลให้ครบถ้วน');
        return;
    }

    if (commandCount < 0 || memoCount < 0) {
        showAlert('ผิดพลาด', 'จำนวนต้องเป็นตัวเลขที่ไม่ติดลบ');
        return;
    }

    if (parseInt(commandCount) === 0 && parseInt(memoCount) === 0) {
        showAlert('ผิดพลาด', 'กรุณากรอกจำนวนคำสั่งหรือบันทึกอย่างน้อยหนึ่งรายการ');
        return;
    }

    toggleLoader('dispatch-submit-button', true);

    try {
        console.log("📤 Sending dispatch data to server...");
        
        // ✅ ใช้ action และ payload ที่ถูกต้อง
        const result = await apiCall('POST', 'generateDispatchBook', {
            requestId: requestId,
            dispatchMonth: dispatchMonth,
            dispatchYear: parseInt(dispatchYear),
            commandCount: parseInt(commandCount),
            memoCount: parseInt(memoCount)
        });
        
        console.log("📥 Server response:", result);
        
        if (result.status === 'success') {
            showAlert('สำเร็จ', 'สร้างหนังสือส่งสำเร็จ');
            const modal = document.getElementById('dispatch-modal');
            if (modal) modal.style.display = 'none';
            
            const form = document.getElementById('dispatch-form');
            if (form) form.reset();
            
            // ✅ เปิด PDF ในแท็บใหม่
            if (result.data && result.data.url) {
                window.open(result.data.url, '_blank');
            }
            
            clearRequestsCache();
            await fetchAllRequestsForCommand();
        } else {
            showAlert('ผิดพลาด', result.message || 'ไม่สามารถสร้างหนังสือส่งได้');
        }
    } catch (error) {
        console.error('❌ Dispatch error:', error);
        showAlert('ผิดพลาด', 'เกิดข้อผิดพลาดในการสร้างหนังสือส่ง: ' + error.message);
    } finally {
        toggleLoader('dispatch-submit-button', false);
    }
}

// ฟังก์ชันจัดการบันทึกข้อความโดยผู้ดูแลระบบ
async function handleAdminMemoActionSubmit(e) {
    if (e) e.preventDefault();
    
    const memoId = document.getElementById('admin-memo-id')?.value;
    const status = document.getElementById('admin-memo-status')?.value;
    
    const completedMemoFile = document.getElementById('admin-completed-memo-file')?.files[0];
    const completedCommandFile = document.getElementById('admin-completed-command-file')?.files[0];
    const dispatchBookFile = document.getElementById('admin-dispatch-book-file')?.files[0];

    let completedMemoFileObject = null;
    let completedCommandFileObject = null;
    let dispatchBookFileObject = null;

    try {
        if (completedMemoFile) {
            completedMemoFileObject = await fileToObject(completedMemoFile);
        }
        if (completedCommandFile) {
            completedCommandFileObject = await fileToObject(completedCommandFile);
        }
        if (dispatchBookFile) {
            dispatchBookFileObject = await fileToObject(dispatchBookFile);
        }
    } catch (error) {
        showAlert('ผิดพลาด', 'ไม่สามารถอ่านไฟล์: ' + error.message);
        return;
    }

    toggleLoader('admin-memo-submit-button', true);

    try {
        const result = await apiCall('POST', 'updateMemoStatus', {
            id: memoId,
            status: status,
            completedMemoFile: completedMemoFileObject,
            completedCommandFile: completedCommandFileObject,
            dispatchBookFile: dispatchBookFileObject
        });
        
        if (result.status === 'success') {
            showAlert('สำเร็จ', 'อัพเดทสถานะและไฟล์เรียบร้อยแล้ว');
            const modal = document.getElementById('admin-memo-action-modal');
            if (modal) modal.style.display = 'none';
            
            const form = document.getElementById('admin-memo-action-form');
            if (form) form.reset();
            await fetchAllMemos();
        } else {
            showAlert('ผิดพลาด', result.message);
        }
    } catch (error) {
        showAlert('ผิดพลาด', 'เกิดข้อผิดพลาดในการอัพเดท: ' + error.message);
    } finally {
        toggleLoader('admin-memo-submit-button', false);
    }
}

// ฟังก์ชันส่งออกรายงานสถิติ
async function exportStatsReport() {
    try {
        const user = getCurrentUser();
        if (!user) return;

        toggleLoader('export-stats', true);

        const [requestsResult, memosResult, usersResult] = await Promise.all([
            apiCall('GET', 'getAllRequests'),
            apiCall('GET', 'getAllMemos'),
            apiCall('GET', 'getAllUsers')
        ]);

        const requests = requestsResult.data || [];
        const memos = memosResult.data || [];
        const users = usersResult.data || [];

        const userRequests = user.role === 'admin' ? requests : requests.filter(req => req.username === user.username);
        const stats = calculateStats(userRequests, memos, users, user);

        const reportData = [
            ['รายงานสถิติระบบไปราชการ', '', '', ''],
            ['วันที่ออกรายงาน', new Date().toLocaleDateString('th-TH'), '', ''],
            ['', '', '', ''],
            ['สถิติภาพรวม', '', '', ''],
            ['คำขอทั้งหมด', stats.totalRequests, '', ''],
            ['คำขอที่เสร็จสิ้น', stats.completedRequests, '', ''],
            ['บันทึกข้อความ', stats.totalMemos, '', ''],
            ['ผู้ใช้ทั้งหมด', stats.totalUsers, '', ''],
            ['', '', '', ''],
            ['สถิติตามสถานะ', '', '', ''],
            ...Object.entries(stats.requestStatus).map(([status, count]) => [translateStatus(status), count, '', '']),
            ['', '', '', ''],
            ['สถิติตามแผนก', '', '', ''],
            ...Object.entries(stats.departmentStats).map(([dept, count]) => [dept, count, '', '']),
            ['', '', '', ''],
            ['สถิติรายเดือน', '', '', ''],
            ['เดือน', 'จำนวนคำขอ', 'เสร็จสิ้น', ''],
            ...stats.monthlyStats.map(month => [month.month, month.count, month.completed, ''])
        ];

        if (user.role === 'admin') {
            reportData.splice(9, 0, 
                ['', '', '', ''],
                ['สถิติผู้ใช้', '', '', ''],
                ['ผู้ใช้ทั้งหมด', stats.userStats.total, '', ''],
                ['ผู้ดูแลระบบ', stats.userStats.admins, '', ''],
                ['ผู้ใช้ทั่วไป', stats.userStats.regularUsers, '', '']
            );
        }

        if (typeof XLSX !== 'undefined') {
            const ws = XLSX.utils.aoa_to_sheet(reportData);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'รายงานสถิติการขออนุญาตไปราชการ');
            
            const fileName = `รายงานสถิติการขออนุญาตไปราชการ_${new Date().toISOString().split('T')[0]}.xlsx`;
            XLSX.writeFile(wb, fileName);

            showAlert('สำเร็จ', 'ส่งออกรายงานเรียบร้อยแล้ว');
        } else {
            showAlert('ผิดพลาด', 'ไม่สามารถส่งออกรายงานได้ ไลบรารี XLSX ไม่พร้อมใช้งาน');
        }

    } catch (error) {
        console.error('Error exporting stats:', error);
        showAlert('ผิดพลาด', 'ไม่สามารถส่งออกรายงานได้');
    } finally {
        toggleLoader('export-stats', false);
    }
}

// --- PATCH helper: format date and load edit data ---
function formatDateForInput(dateValue) {
    if (!dateValue) return '';
    const d = new Date(dateValue);
    if (isNaN(d)) return '';
    return d.toISOString().split('T')[0];
}

function loadEditFormData(data) {
    if (!data) return;
    const info = document.getElementById('edit-request-info');
    if (info) info.classList.remove('hidden');
    const idSpan = document.getElementById('edit-request-id-display');
    if (idSpan) idSpan.textContent = data.requestId || data.id || data.requestid || '';
    const d1 = document.getElementById('edit-doc-date');
    const d2 = document.getElementById('edit-start-date');
    const d3 = document.getElementById('edit-end-date');
    if (d1) d1.value = formatDateForInput(data.docDate || data.docdate);
    if (d2) d2.value = formatDateForInput(data.startDate || data.startdate);
    if (d3) d3.value = formatDateForInput(data.endDate || data.enddate);
    const loc = document.getElementById('edit-location');
    if (loc) loc.value = data.location || data.Location || '';
}

// ฟังก์ชันสำหรับทดสอบการโหลดข้อมูล
async function testLoadEditData(requestId) {
    try {
        const user = getCurrentUser();
        const username = user ? user.username : '';
        
        console.log('🧪 Testing load edit data for:', { requestId, username });
        
        const result = await apiCall('GET', 'getDraftRequest', { 
            requestId: requestId, 
            username: username 
        });
        
        console.log('🧪 Test result:', result);
        return result;
    } catch (error) {
        console.error('🧪 Test error:', error);
        return null;
    }
}

// ✅ ฟังก์ชันเปิดหน้า "สร้างคำขอใหม่"
async function openNewRequestForm() {
    try {
        console.log("🆕 เปิดหน้าร่างคำขอใหม่...");

        const formResult = document.getElementById('form-result');
        const requestForm = document.getElementById('request-form');
        const formAttendeesList = document.getElementById('form-attendees-list');
        
        if (formResult) formResult.classList.add('hidden');
        if (requestForm) requestForm.reset();
        if (formAttendeesList) formAttendeesList.innerHTML = '';

        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        
        const formDocDate = document.getElementById('form-doc-date');
        if (formDocDate) formDocDate.value = `${yyyy}-${mm}-${dd}`;

        switchPage('form-page');

        setTimeout(() => tryAutoFillRequester(), 300);

        console.log("✅ หน้า 'ร่างคำขอใหม่' เปิดเรียบร้อย");
    } catch (err) {
        console.error("❌ เปิดหน้าร่างคำขอใหม่ล้มเหลว:", err);
        showAlert("ผิดพลาด", "ไม่สามารถเปิดหน้าร่างคำขอใหม่ได้");
    }
}

// 🧠 ฟังก์ชันเติมข้อมูลผู้ขอ
function tryAutoFillRequester(retry = 0) {
    const nameInput = document.getElementById('form-requester-name');
    const posInput = document.getElementById('form-requester-position');
    const dateInput = document.getElementById('form-doc-date');

    if (!nameInput || !posInput) {
        console.warn("⚠️ ยังไม่พบ element ช่องชื่อ/ตำแหน่งใน DOM");
        if (retry < 5) setTimeout(() => tryAutoFillRequester(retry + 1), 500);
        return;
    }

    if (dateInput && !dateInput.value) {
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        dateInput.value = `${yyyy}-${mm}-${dd}`;
    }

    let user = window.currentUser;
    if (!user) {
        const storedUser = sessionStorage.getItem('currentUser');
        if (storedUser) {
            try {
                user = JSON.parse(storedUser);
                window.currentUser = user;
                console.log("♻️ โหลด currentUser จาก sessionStorage:", user);
            } catch (err) {
                console.warn("⚠️ ไม่สามารถแปลงข้อมูล currentUser:", err);
            }
        }
    }

    if (user) {
        nameInput.value = user.fullName || user.username || '';
        posInput.value = user.position || '';
        console.log("✅ กรอกชื่อ–ตำแหน่งอัตโนมัติสำเร็จ:", user.fullName, user.position);
    } else {
        console.warn("⏳ currentUser ยังไม่พร้อม (รออีกครั้งใน 1 วิ) – ครั้งที่", retry + 1);
        if (retry < 5) setTimeout(() => tryAutoFillRequester(retry + 1), 1000);
    }
}

// ✅ ฟังก์ชันเปิด Send Memo Modal
function openSendMemoModal(requestId) {
    console.log("📤 Opening send memo modal for:", requestId);
    
    if (!requestId) {
        console.error("❌ No requestId provided");
        showAlert('ผิดพลาด', 'ไม่พบรหัสคำขอ');
        return;
    }
    
    const requestIdInput = document.getElementById('memo-modal-request-id');
    const modal = document.getElementById('send-memo-modal');
    
    if (!requestIdInput || !modal) {
        console.error("❌ Required elements not found");
        showAlert('ระบบผิดพลาด', 'ไม่พบองค์ประกอบที่จำเป็นในหน้า');
        return;
    }
    
    // ตั้งค่าข้อมูลในฟอร์ม
    requestIdInput.value = requestId;
    
    // รีเซ็ตฟอร์ม
    const form = document.getElementById('send-memo-form');
    if (form) form.reset();
    
    // แสดง modal
    modal.style.display = 'flex';
    
    console.log("✅ Send memo modal opened successfully");
}

// ✅ ฟังก์ชันทดสอบระบบหนังสือส่ง
function testDispatchSystem() {
    console.log("🧪 Testing Dispatch System:");
    
    console.log("🔧 Function check:", {
        openDispatchModal: typeof openDispatchModal,
        handleDispatchFormSubmit: typeof handleDispatchFormSubmit,
        renderAdminRequestsList: typeof renderAdminRequestsList
    });
    
    console.log("🔍 Element check:", {
        adminRequestsList: document.getElementById('admin-requests-list'),
        dispatchModal: document.getElementById('dispatch-modal'),
        dispatchForm: document.getElementById('dispatch-form')
    });
    
    console.log("📊 Data check:", {
        allRequestsCache: allRequestsCache?.length,
        currentUser: getCurrentUser()
    });
}

// 🔧 เรียกใช้เมื่อโหลดหน้าเพื่อตรวจสอบ
document.addEventListener('DOMContentLoaded', function() {
    console.log("🚀 Edit page functions loaded");
    enhanceEditFunctionSafety();
});
