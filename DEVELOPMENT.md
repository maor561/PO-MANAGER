# 🛠️ מדריך פיתוח - מערכת מעקב רכש

מדריך לפיתחים הרוצים להתאים או להרחיב את המערכת.

## 📁 מבנה הקוד

```
PO/
├── index.html                 # ממשק HTML
├── assets/
│   ├── css/style.css         # עיצוב
│   ├── js/app.js             # לוגיקה ראשית (400+ שורות)
│   └── data/sample-data.json  # נתוני דוגמה
├── docs/
│   └── GUIDE.md              # מדריך משתמש
└── DEVELOPMENT.md             # קובץ זה
```

## 🏗️ ארכיטקטורה

### תזרים נתונים

```
┌─────────────┐
│   HTML      │  (ממשק משתמש)
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  JavaScript │  (לוגיקה)
│  (app.js)   │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ localStorage│  (אחסון)
└─────────────┘
```

### אובייקט app

כל הלוגיקה ממרכזת באובייקט `app`:

```javascript
const app = {
    orders: [],              // מערך ההזמנות
    editingOrderId: null,    // הזמנה בעריכה

    init() { ... }           // אתחול
    addOrder() { ... }       // הוספה
    editOrder(id) { ... }    // עריכה
    deleteOrder(id) { ... }  // מחיקה
    // וכו'
};
```

## 🔧 הרחבה והתאמה

### הוספת שדה חדש

**1. ב-index.html - טופס הוספה:**
```html
<div class="form-group">
    <label>שדה חדש *</label>
    <input type="text" id="newField" required>
</div>
```

**2. ב-app.js - בפונקציית addOrder:**
```javascript
const order = {
    // ... שדות קיימים
    newField: document.getElementById('newField').value,
};
```

**3. ב-app.js - בפונקציית editOrder:**
```javascript
document.getElementById('editNewField').value = order.newField || '';
```

**4. ב-HTML - טופס עריכה:**
```html
<div class="form-group">
    <label>שדה חדש</label>
    <input type="text" id="editNewField">
</div>
```

### שינוי שלבים

בקובץ `assets/js/app.js`, בתחילת הקובץ:

```javascript
const STAGES = {
    1: 'שלב 1',
    2: 'שלב 2',
    // שנה כאן
};
```

### שינוי צבעים

בקובץ `assets/css/style.css`:

```css
.stat-card {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    /* שנה כאן */
}
```

## 📊 API מקומי (localStorage)

### שמירה
```javascript
app.saveOrders();
// שומר את app.orders ל-localStorage
```

### טעינה
```javascript
app.loadOrders();
// טוען מ-localStorage ל-app.orders
```

## 🎯 עדכון דאשבורד

```javascript
app.updateDashboard();
// מחשב ומעדכן את כל הסטטיסטיקות
```

### חישובים

```javascript
// סה"כ הזמנות
const total = this.orders.length;

// הושלמו
const completed = this.orders.filter(o => o.stage === 6).length;

// מתעכבים (עבר תאריך מועד)
const delayed = this.orders.filter(o => this.isOrderDelayed(o)).length;

// סה"כ הוצאות
const totalCost = this.orders.reduce(
    (sum, o) => sum + (o.quantity * o.unitPrice), 
    0
);
```

## 🔍 פונקציות עזר

### זיהוי עיכוב
```javascript
isOrderDelayed(order) {
    // מחזיר true אם עבר תאריך המועד
    if (!order.expectedDeliveryDate || order.stage === 6) return false;
    const expectedDate = new Date(order.expectedDeliveryDate);
    const today = new Date();
    return today > expectedDate;
}
```

### הצגת הודעות
```javascript
app.showMessage('טקסט', 'success'); // ירוק
app.showMessage('טקסט', 'error');   // אדום
```

## 📤 Excel Integration

### ספרייה בשימוש
```javascript
// XLSX - https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.min.js
XLSX.utils.json_to_sheet(data)  // JSON → Sheet
XLSX.utils.sheet_to_json(sheet) // Sheet → JSON
XLSX.writeFile(wb, filename)    // שמירה
```

### יצוא
```javascript
exportToExcel() {
    const data = this.orders.map(order => ({
        // מיפוי שדות
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    // יצוא...
}
```

### יבוא
```javascript
importFromExcel(event) {
    const file = event.target.files[0];
    const reader = new FileReader();
    reader.onload = (e) => {
        const workbook = XLSX.read(e.target.result, { type: 'binary' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(sheet);
        // עיבוד...
    };
}
```

## 🎨 התאמת ממשק

### Themes
בקובץ CSS, שנה את הגדיענים:
```css
/* צבע ראשי */
background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);

/* צבע כפתורים */
.btn-primary { background: #667eea; }

/* צבע אזהרה */
.stat-card.warning { background: linear-gradient(...); }
```

### תגובת עיצוב
```css
@media (max-width: 768px) {
    /* הגדרות למסך קטן */
}
```

## 🐛 ניפוי

### Console
```javascript
// בדוק את orders
console.log(app.orders);

// בדוק localStorage
console.log(localStorage.getItem('procurementOrders'));

// בדוק סטטיסטיקות
console.log('Total:', app.orders.length);
```

### DevTools
```
F12 → Console → הריצ קוד מיד
```

## 📈 ביצועים

### מגבלות נוכחיות
- **localStorage limit**: ~5-10MB (בדרך כלל מספיק ל-10,000+ הזמנות)
- **רינדור**: בעיות עם 10,000+ הזמנות בטבלה

### שיפור ביצועים
```javascript
// דוגמה: עמידוד (pagination)
const itemsPerPage = 50;
const page = 1;
const start = (page - 1) * itemsPerPage;
const paginatedOrders = this.orders.slice(start, start + itemsPerPage);
```

## 🧪 בדיקות

### בדיקה ידנית
1. פתח index.html
2. F12 → Console
3. הרץ קוד:
```javascript
// הוסף הזמנה
app.orders.push({
    id: Date.now(),
    orderNumber: 'TEST-001',
    date: '2026-05-13',
    expectedDeliveryDate: '2026-06-13',
    supplier: 'Test Supplier',
    itemName: 'Test Item',
    quantity: 1,
    unitPrice: 100,
    stage: 1,
    notes: 'Test',
    createdAt: new Date().toISOString()
});
app.saveOrders();
app.renderOrders();
```

## 🚀 הרחבות עתידיות

### תכונות שאפשר להוסיף

1. **אחסון בשרת**
   - API Node.js/Python
   - MongoDB/SQL
   - תמיכה במשתמשים מרובים

2. **הרשאות משתמש**
   - Login/Authentication
   - תפקידים שונים (Admin, Manager, Viewer)
   - ניהול גישה

3. **ניטור מתקדם**
   - דוחות PDF
   - גרפים וטבלאות
   - export to CSV

4. **הודעות**
   - Email alerts
   - SMS notifications
   - Push notifications

5. **אינטגרציות**
   - ERP (SAP, Oracle)
   - פלטפורמות e-commerce
   - בנקים ותשלומים

## 📚 קישורים שימושיים

- [XLSX Documentation](https://github.com/SheetJS/sheetjs)
- [localStorage MDN](https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage)
- [CSS Grid](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_Grid_Layout)
- [Date API](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date)

## 🤝 תרומות

טיפים לפיתוח נקי:

1. **בדוק ברמה גבוהה**
   - כל שדה משמש?
   - הוא בשימוש בכל מקום?

2. **הערות טובות**
   ```javascript
   // ✅ טוב
   // מחשב עיכוב בהשוואה לתאריך המועד
   
   // ❌ רע
   // תאריך
   ```

3. **שמות משתנים ברורים**
   ```javascript
   // ✅
   expectedDeliveryDate
   
   // ❌
   edDate, ed, date2
   ```

## 📝 רישום שינויים

### גרסה 1.0 (נוכחי)
- ✅ דאשבורד בסיסי
- ✅ ניהול הזמנות
- ✅ יצוא/יבוא Excel
- ✅ localStorage

### גרסה 2.0 (עתיד)
- 🔲 אחסון בשרת
- 🔲 הרשאות משתמשים
- 🔲 דוחות מתקדמים

---

**עדכון אחרון**: 13.5.2026  
**מתחזק**: צוות הפיתוח
