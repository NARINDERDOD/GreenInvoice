console.log("✅ scriptForReceipt.js loaded");

let idsArrayGlobal = [];
let invoiceListGlobal = [];

ZOHO.embeddedApp.on("PageLoad", function (data) {
    console.log("Zoho Embedded App initialized with data:", data);
    idsArrayGlobal = data.EntityId;

    if (Array.isArray(idsArrayGlobal)) {
        runInvoiceFunction(idsArrayGlobal);
    } else {
        console.error("EntityId is not an array:", idsArrayGlobal);
    }

    ZOHO.CRM.UI.Resize({ width: 100, height: 200 });
});

async function runInvoiceFunction(idsArray) {
    const outputEl = document.getElementById("invoiceOutput");
    let Grand_TotalList = [];
    let invoiceList = [];

    const promises = idsArray.map(id =>
        ZOHO.CRM.API.getRecord({
            Entity: "Invoices",
            approved: "both",
            RecordID: id
        }).then(data => {
            const invoice = data.data[0];
            console.log("✅ invoice:", invoice);

            let invoiceData = {
                id: id,
                subTotal: invoice.Sub_Total,
                grandTotal: parseFloat(invoice.Grand_Total),
                discount: invoice.Discount,
                tax: invoice.Tax,
                date: invoice.Invoice_Date || new Date().toISOString().split('T')[0],
                currency: invoice.Currency || "ILS",
                details: invoice.Account_Name?.name || "",
                Contact_Name: invoice.Contact_Name?.name || "",
                contactId: invoice.Contact_Name?.id || "",
                Bank_name: invoice.createinvoice1__Select_Bank || "",
                Bank_branch: invoice.createinvoice1__Bank_Branch || "",
                Document_Type: invoice.createinvoice1__Document_Type || "",
                Product_Details: invoice.Product_Details || "",
                Payment_Types: invoice.createinvoice1__Receipt_Type[0] || ""

            };

            invoiceList.push(invoiceData);
            Grand_TotalList.push(invoiceData.grandTotal);
        })
    );

    console.log("invoiceList", invoiceList);


    await Promise.all(promises);
   
    let totalTaxx = 0;
    let grandTotal = 0;
    let totalLinePriceList = [];  // Ensure this is always initialized as an array
    let totaltax = [];
    let totalLineItems_discout = [];
    
    // Loop through the invoiceList to calculate the total tax and grand total
    invoiceList.forEach(invoice => {
        if (Array.isArray(invoice.Product_Details)) {
            invoice.Product_Details.forEach(product => {
                let lineDiscount = product.Discount;
                let list_price = product.list_price;
                let quantity = product.quantity;
    
                let afterDiscount = list_price - lineDiscount;
                let linePrice = afterDiscount * quantity;
                console.log("linePrice : ₪" + linePrice);
    
                // Ensure totalLinePriceList is an array before pushing
                if (!Array.isArray(totalLinePriceList)) {
                    totalLinePriceList = [];  // Reset if not an array
                }
    
                totalLinePriceList.push(linePrice);  // Add line price to the array
    
                totalLineItems_discout.push(lineDiscount * quantity);  // Store total discount
                console.log("Product Discount: ₪" + lineDiscount);
            });
        } else {
            console.log("No product details available for invoice: " + invoice.id);
        }
    
        // Add logic for tax and grand total calculation
        let invoiceDiscount = parseFloat(invoice.discount);
        console.log("Invoice Grand Total: ₪" + parseFloat(invoice.grandTotal));
    
        totalLinePriceList = totalLinePriceList.reduce((a, b) => a + b, 0);  // Summing the line prices
        console.log("totalLinePrice : ₪" + totalLinePriceList);
    
        // Apply the discount to the grand total if discount is not null or 0
        if (invoiceDiscount && invoiceDiscount > 0) {
            console.log("Applying Discount: ₪" + invoiceDiscount);
            invoice.grandTotal += invoiceDiscount;  // Subtract the discount from the grand total
            console.log("after Discount: ₪" + invoice.grandTotal);
        }
    
        let invoiceTax = (totalLinePriceList * 18) / 100;  // Calculate tax (18% of grand total)
        console.log("Calculated tax: ₪" + invoiceTax);
    
        totaltax.push(invoiceTax); 
        totalTaxx += invoiceTax;  // Add the calculated tax to total tax
    
        // Add the grand total (without tax) to the overall grand total
        grandTotal += totalLinePriceList;
    });
    
    // Calculate the final grand total by adding the total tax (if applicable)
    const finalGrandTotal = grandTotal + totalTaxx;
    const totaldiscount = totalLineItems_discout.reduce((a, b) => a + b, 0);
    const totalt = totaltax.reduce((a, b) => a + b, 0);
    
    console.log("Total Tax: ₪" + totalt);  // Total tax amount
    console.log("discount count: ₪" + totaldiscount);  // Total discount amount
    console.log("Grand Total before tax: ₪" + grandTotal);  // Total before tax
    console.log("Grand Total after adding tax: ₪" + finalGrandTotal);  // Final grand total
    
    
    
    invoiceListGlobal = invoiceList;

const allowedTypes = ["חשבונית מס", "תעודת משלוח", "חשבון עסקה"];
const documentTypes = [...new Set(invoiceList.map(inv => inv.Document_Type).filter(Boolean))];

if (documentTypes.length !== 1 || !allowedTypes.includes(documentTypes[0])) {
    alert("⚠️ כל החשבוניות שנבחרו חייבות להיות מאותו סוג מסמך, והוא חייב להיות אחד מהבאים: חשבונית מס, תעודת משלוח, או חשבון עסקה.");
    return; // ❌ Stop if condition not met
}


    const total = Grand_TotalList.reduce((a, b) => a + b, 0);
    const totalEl = document.getElementById("grandTotalAmount");
    if (totalEl) {
        totalEl.value = `₪ ${total.toFixed(2)}`;
    }

    const contactIds = [...new Set(invoiceList.map(inv => inv.contactId))];
    if (contactIds.length !== 1) {
        alert("⚠️ אנא בחר את אותם אנשי קשר. פרטי הבנק לא ימולאו אוטומטית.");
        renderInvoiceSummary(invoiceList,totaldiscount,totalt,grandTotal,finalGrandTotal);
        resizeToContent();
        return;
    }

    const firstInvoice = invoiceList[0];
    const contactId = contactIds[0];

    const tbody = document.getElementById("receiptSubformBody");
    if (tbody) tbody.innerHTML = "";

    try {
        const contactResp = await ZOHO.CRM.API.getRecord({
            Entity: "Contacts",
            approved: "both",
            RecordID: contactId
        });

        const contact = contactResp.data[0];
        const bankName = contact["createinvoice1__The_Bank_s_Name"] || "";
        const branchNumber = contact["createinvoice1__Branch_Number"] || "";

        addReceiptRow({
            amount: finalGrandTotal,
            date: new Date().toISOString().split('T')[0],
            currency: "ILS",
            details: firstInvoice.Bank_name,
            branch: firstInvoice.Bank_branch,
            manual: true,
            paymentType: firstInvoice.Payment_Types || ""
        });

    } catch (err) {
        console.error("❌ Failed to fetch contact info:", err);
    }

    renderInvoiceSummary(invoiceList,totaldiscount,totalt,grandTotal,finalGrandTotal);
    setTimeout(() => resizeToContent(), 100);
}

function addReceiptRow(data = {}) {


    const tbody = document.getElementById("receiptSubformBody");
    if (!tbody) return;

    const isManual = data.manual === true;
    if (!isManual && (!data.amount || isNaN(data.amount) || Number(data.amount) <= 0)) {
        console.warn("⛔ Skipping auto-added row due to missing/invalid amount");
        return;
    }
    const tr = document.createElement("tr");
    tr.innerHTML = `
        <td>
            <select onchange="handlePaymentTypeChange(this)">
                <option value="העברה בנקאית" ${data.paymentType === "העברה בנקאית" ? "selected" : ""}>העברה בנקאית (Wire-transfer)</option>
                <option value="ניכוי במקור" ${data.paymentType === "ניכוי במקור" ? "selected" : ""}>ניכוי במקור (Tax deduction)</option>
                <option value="מזומן" ${data.paymentType === "מזומן" ? "selected" : ""}>מזומן (Cash)</option>
                <option value="צ׳ק" ${data.paymentType === "צ׳ק" ? "selected" : ""}>צ׳ק (Cheque)</option>
                <option value="כרטיס אשראי" ${data.paymentType === "כרטיס אשראי" ? "selected" : ""}>כרטיס אשראי (Credit card)</option>
                <option value="פייפאל" ${data.paymentType === "פייפאל" ? "selected" : ""}>פייפאל (Paypal)</option>
                <option value="Bit" ${data.paymentType === "Bit" ? "selected" : ""}>Bit</option>
                 <option value="Google Pay" ${data.paymentType === "Google Pay" ? "selected" : ""}>Google Pay</option>
                                  <option value="Apple Pay" ${data.paymentType === "Apple Pay" ? "selected" : ""}>Apple Pay</option>


            </select>
        </td>
        <td><input type="date" value="${data.date}" /></td>
        <td><input type="number" class="amount-field" value="${data.amount}" oninput="updateTotal()" placeholder="₪ סכום" /></td>
        <td>
 <select>
  <option value="ILS" ${data.currency === 'ILS' ? 'selected' : ''}>₪ ILS</option>
  <option value="USD" ${data.currency === 'USD' ? 'selected' : ''}>$ USD</option>
  <option value="EUR" ${data.currency === 'EUR' ? 'selected' : ''}>€ EUR</option>
  <option value="GBP" ${data.currency === 'GBP' ? 'selected' : ''}>£ GBP</option>
  <option value="JPY" ${data.currency === 'JPY' ? 'selected' : ''}>¥ JPY</option>
  <option value="CHF" ${data.currency === 'CHF' ? 'selected' : ''}>CHF</option>
  <option value="CNY" ${data.currency === 'CNY' ? 'selected' : ''}>¥ CNY</option>
  <option value="AUD" ${data.currency === 'AUD' ? 'selected' : ''}>A$ AUD</option>
  <option value="CAD" ${data.currency === 'CAD' ? 'selected' : ''}>C$ CAD</option>
  <option value="RUB" ${data.currency === 'RUB' ? 'selected' : ''}>₽ RUB</option>
  <option value="BRL" ${data.currency === 'BRL' ? 'selected' : ''}>R$ BRL</option>
  <option value="HKD" ${data.currency === 'HKD' ? 'selected' : ''}>HK$ HKD</option>
  <option value="SGD" ${data.currency === 'SGD' ? 'selected' : ''}>S$ SGD</option>
  <option value="THB" ${data.currency === 'THB' ? 'selected' : ''}>฿ THB</option>
  <option value="MXN" ${data.currency === 'MXN' ? 'selected' : ''}>Mex$ MXN</option>
  <option value="TRY" ${data.currency === 'TRY' ? 'selected' : ''}>₺ TRY</option>
  <option value="NZD" ${data.currency === 'NZD' ? 'selected' : ''}>NZ$ NZD</option>
  <option value="SEK" ${data.currency === 'SEK' ? 'selected' : ''}>kr SEK</option>
  <option value="NOK" ${data.currency === 'NOK' ? 'selected' : ''}>kr NOK</option>
  <option value="DKK" ${data.currency === 'DKK' ? 'selected' : ''}>kr DKK</option>
  <option value="KRW" ${data.currency === 'KRW' ? 'selected' : ''}>₩ KRW</option>
  <option value="INR" ${data.currency === 'INR' ? 'selected' : ''}>₹ INR</option>
  <option value="IDR" ${data.currency === 'IDR' ? 'selected' : ''}>Rp IDR</option>
  <option value="PLN" ${data.currency === 'PLN' ? 'selected' : ''}>zł PLN</option>
  <option value="RON" ${data.currency === 'RON' ? 'selected' : ''}>lei RON</option>
  <option value="ZAR" ${data.currency === 'ZAR' ? 'selected' : ''}>R ZAR</option>
  <option value="HRK" ${data.currency === 'HRK' ? 'selected' : ''}>kn HRK</option>
</select>           
        </td>
         <td class="bank-fields">
    <input type="text" placeholder="בנק (לקוח)" value="${data.details || ''}" />
</td>
<td class="bank-fields">
    <input type="text" placeholder="סניף (לקוח)" value="${data.branch || ''}" />
</td>
<td class="bank-fields">
    <input type="text" placeholder="חשבון (לקוח)" value="${data.account || ''}" />
</td>

    
          
 <!-- Credit Card Fields -->
        <td class="card-fields" style="display:none;">
            <input type="text" placeholder="מספר כרטיס" />
        </td>
        <td class="card-fields" style="display:none;">
            <select>
                 <option value="" disabled selected>סוג כרטיס</option>
                <option>Unknown (לא ידוע)</option>
                <option>Isracard (ישראכרט)</option>
                <option>Visa (ויזה)</option>
                <option>Mastercard (מאסטרקארד)</option>
                <option>American Express (אמריקן אקספרס)</option>
                <option>Diners (דיינרס)</option>
            </select>
        </td>
 
     <!-- Deal Type Picklist -->
<td class="card-fields" style="display:none;">
  <select id="dealType" onchange="handleDealTypeChange(this)">
    <option value="" disabled selected>סוג עסקה</option>
    <option value="Standard">Standard (רגיל)</option>
    <option value="Payments">Payments (תשלומים)</option>
    <option value="Credit">Credit (קרדיט)</option>
    <option value="Deferred">Deferred (חיוב נדחה)</option>
    <option value="Other">Other (אחר)</option>
    <option value="Recurring">Recurring (הוראת קבע)</option>
  </select>
</td>

<!-- NumPayments Field (wrapped in a container) -->
<td id="numPaymentsContainer" class="card-fields" style="display:none;">
  <input type="number" id="numPayments" placeholder="מספר תשלומים" min="1" max="36" value="1" />
</td>
    <!-- Cheque Fields -->
<td class="cheque-fields" style="display:none;">
    <input type="text" placeholder="מספר שיק" />
</td>
<!-- PayPal Fields -->
<td class="paypal-fields" style="display:none;">
  <input type="text" placeholder="חשבון משלם" />
</td>
<td class="paypal-fields" style="display:none;">
  <input type="text" placeholder="מספר טרנזקציה" />
</td>

<!-- Bit Fields -->
<td class="bit-fields" style="display:none;">
    <input type="text" placeholder="חשבון משלם" />
</td>
<td class="bit-fields" style="display:none;">
    <input type="text" placeholder="מספר טרנזקציה" />
</td>

<!-- Google Pay Fields -->
<td class="googlepay-fields" style="display:none;">
    <input type="text" placeholder="חשבון משלם" />
</td>
<td class="googlepay-fields" style="display:none;">
    <input type="text" placeholder="מספר טרנזקציה" />
</td>

<!-- Apple Pay Fields -->
<td class="applepay-fields" style="display:none;">
    <input type="text" placeholder="חשבון משלם" />
</td>
<td class="applepay-fields" style="display:none;">
    <input type="text" placeholder="מספר טרנזקציה" />
</td>


        <td><button onclick="this.closest('tr').remove(); updateTotal();" title="Remove row">❌</button></td>
    `;
    
    tbody.appendChild(tr);
    updateTotal();
    handlePaymentTypeChange(tr.querySelector("select")); // Ensure correct display on render
    
}

function updateTotal() {
    const amountInputs = document.querySelectorAll("#receiptSubformBody .amount-field");
    let sum = 0;

    amountInputs.forEach(input => {
        const value = parseFloat(input.value);
        if (!isNaN(value)) sum += value;
    });

    const totalPaidEl = document.getElementById("totalPaid");
    if (totalPaidEl) totalPaidEl.textContent = `₪${sum.toFixed(2)}`;

    const grandTotalInput = document.getElementById("grandTotalAmount");
    if (grandTotalInput) grandTotalInput.value = `₪ ${sum.toFixed(2)}`;
}


function renderInvoiceSummary(invoiceList,itemsdis,tax,withouttax,finalGrandTotal) {
    const summaryEl = document.getElementById("invoiceSummary");
    summaryEl.innerHTML = "";

    let totalTax = 0, totalDiscount = 0, totalGrand = 0;
    invoiceList.forEach(inv => {
        totalTax += parseFloat(inv.tax || 0);
        totalDiscount += parseFloat(inv.discount || 0);
        totalGrand += parseFloat(inv.grandTotal || 0);
    });

    let html = `
      <div><strong>סיכום מסמכים שנבחרו (${invoiceList.length} רְשׁוּמָה${invoiceList.length > 1 ? "ס" : ""})</strong></div>
      <ul style="padding: 0; list-style: none;">
    `;

    if (tax > 0) html += `<li><strong>מע"מ:</strong> ₪ ${tax.toFixed(2)}</li>`;
    if (itemsdis > 0) html += `<li><strong>הנחה:</strong> ₪ ${itemsdis.toFixed(2)}</li>`;
    html += `<li><strong>סכום ללא מס</strong> ₪ ${withouttax}</li>`;
    html += `<li><strong>סה"כ סכום מסמכים שנבחרו:</strong> ₪ ${finalGrandTotal.toFixed(2)}</li></ul>`;

    // html += `<li><strong>סה"כ סכום מסמכים שנבחרו:</strong> ₪ ${totalGrand.toFixed(2)}</li></ul>`;

    summaryEl.innerHTML = html;
}

function createReceipt() {
    if (hasReceiptBeenCreated) return;

    const outputEl = document.getElementById("invoiceOutput");
    const totalInput = document.getElementById("grandTotalAmount");
    const createBtn = document.getElementById("createReceiptBtn");
    const addReceipt = document.getElementById("addReceipt");

    createBtn.disabled = true;
    createBtn.textContent = "נוצר...";
    hasReceiptBeenCreated = true;

    const totalValue = parseFloat(totalInput.value.replace(/[₪,]/g, '').trim());
    if (isNaN(totalValue)) {
        alert("אנא הזן סכום תקף");
        createBtn.disabled = false;
        createBtn.textContent = "Create receipt";
        hasReceiptBeenCreated = false;
        return;
    }

// 🔁 Extract receipt row data
const receiptRows = [];
const rows = document.querySelectorAll("#receiptSubformBody tr");

rows.forEach(row => {
    const paymentTypeLabel = row.querySelector("td:nth-child(1) select")?.value || "";
    const date = row.querySelector("td:nth-child(2) input")?.value || "";
    const amount = parseFloat(row.querySelector("td:nth-child(3) input")?.value || 0);
    const currency = row.querySelector("td:nth-child(4) select")?.value || "";

    const bankName = row.querySelector("td:nth-child(5) input")?.value || "";
    const bankBranch = row.querySelector("td:nth-child(6) input")?.value || "";
    const bankAccount = row.querySelector("td:nth-child(7) input")?.value || "";

    const cardNum = row.querySelector("td:nth-child(8) input")?.value || "";
    const cardType = row.querySelector("td:nth-child(9) select")?.value || "";
    const transactionId = row.querySelector("td:nth-child(10) input")?.value || "";
    const checkNumber = row.querySelector("td.cheque-fields input")?.value || "";

// PayPal fields
const paypalAccount = row.querySelector("td.paypal-fields input[placeholder='Paying Account']")?.value || "";
const paypalTransaction = row.querySelector("td.paypal-fields input[placeholder='Transaction Number']")?.value || "";


// bit fields
const bitPayingAccount = row.querySelector("td:nth-child(11) input")?.value || ""; // Bit Paying Account
const bitTransactionNumber = row.querySelector("td:nth-child(12) input")?.value || ""; // Bit Transaction Number


const googlePayAccount = row.querySelector("td:nth-child(11) input")?.value || ""; // Google Pay Account
const googlePayTransactionNumber = row.querySelector("td:nth-child(12) input")?.value || ""; // Google Pay Transaction Number

const applePayAccount = row.querySelector("td:nth-child(11) input")?.value || ""; // Apple Pay Paying Account
const applePayTransactionNumber = row.querySelector("td:nth-child(12) input")?.value || ""; // Apple Pay Transaction Number

const dealType = row.querySelector("select#dealType")?.value || "Standard";
const numPaymentsInput = row.querySelector("#numPayments");
const numPayments = (dealType === 'Payments' || dealType === 'Credit') && numPaymentsInput
    ? parseInt(numPaymentsInput.value, 10) || 1
    : 1;


console.log("📤 paypalTransaction", paypalTransaction , "  ", paypalAccount);

    if (!isNaN(amount) && amount > 0) {
        const paymentEntry = {
            date: date,
            type: mapPaymentTypeToGreenInvoice(paymentTypeLabel),
            price: amount,
            currency: currency,
            description: currency
        };

        // ⏬ Inject flat card/bank info
        if (paymentTypeLabel === "Apple Pay") { // Send Apple-specific data
            paymentEntry.accountId = applePayAccount;
            paymentEntry.transactionId = applePayTransactionNumber;
            paymentEntry.appType = 6;

        }
       else if (paymentTypeLabel === "Google Pay") { // Send Google-specific data
            paymentEntry.accountId = googlePayAccount;
            paymentEntry.transactionId = googlePayTransactionNumber;
            paymentEntry.appType = 5;

        }
        else if (paymentTypeLabel === "Bit") { // Send Bit-specific data
            paymentEntry.accountId = bitPayingAccount;
            paymentEntry.transactionId = bitTransactionNumber;
            paymentEntry.appType = 1;

        }else if (paymentTypeLabel === "פייפאל") {
            paymentEntry.accountId = paypalAccount;
            paymentEntry.transactionId = paypalTransaction;
        }else if (paymentTypeLabel === "כרטיס אשראי") {
            paymentEntry.cardNum = cardNum;
            paymentEntry.cardType = mapCardTypeToGreenInvoice(cardType);
            paymentEntry.dealType = mapDealTypeToGreenInvoice(dealType);
            paymentEntry.numPayments = numPayments;
        }  else if (paymentTypeLabel === "צ׳ק") {
            paymentEntry.bankName = bankName;
            paymentEntry.bankAccount = bankAccount;
            paymentEntry.bankBranch = bankBranch;
            paymentEntry.chequeNum = checkNumber;
        } else  {
            paymentEntry.bankName = bankName;
            paymentEntry.bankBranch = bankBranch;
            paymentEntry.bankAccount = bankAccount;
        }

        receiptRows.push(paymentEntry);
    }
});



    const req_data = {
        arguments: JSON.stringify({
            widgetData: {
                ids: idsArrayGlobal,
                custom_total: totalValue,
                payment: receiptRows
            }
        })
    };

    console.log("📤 Calling tax_invoice1 with:", req_data);

    ZOHO.CRM.FUNCTIONS.execute("reception1", req_data)
    .then(function (data) {
        console.log("✅ Function response:", data);
    
        let details;
        try {
            const rawOutput = typeof data.details === "string" ? data.details : data.details.output;
            details = typeof rawOutput === "string" ? JSON.parse(rawOutput) : rawOutput;
        } catch (e) {
            console.error("❌ Failed to parse details JSON:", data.details);
            outputEl.textContent = JSON.stringify("e", null, 2);

            details = {};
        }
    
        if (details.errorCode) {
            console.error("🚫 GreenInvoice Error:", details.errorMessage || "Unknown error");
    
            alert("❌ שגיאה מ-GreenInvoice:\n" + (details.errorMessage || "אירעה שגיאה לא ידועה."));
    
            createBtn.disabled = false;
            createBtn.textContent = "Create receipt";
            hasReceiptBeenCreated = false;
    
            return; // ⛔ prevent further execution
        }
    
         
            
            addReceipt.disabled = true ;

            outputEl.textContent = JSON.stringify("😃 קבלה נוצרה בהצלחה", null, 2);


                 // 🔽 Hide all ❌ remove buttons
    document.querySelectorAll("#receiptSubformBody button[title='Remove row']").forEach(btn => {
        btn.style.display = "none";
    });
    details = data.details;

            
            

            const downloadUrl = extractDocumentURL(details);

            if (downloadUrl) {
                const container = document.getElementById("pdfDownloadContainer");
                container.innerHTML = "";

                const link = document.createElement("a");
                link.href = downloadUrl;
                link.textContent = " 📄 הורד PDF";
                link.target = "_blank";

                Object.assign(link.style, {
                    display: "inline-block",
                    marginTop: "10px",
                    padding: "10px 16px",
                    backgroundColor: "#00b27f",
                    color: "white",
                    borderRadius: "8px",
                    fontWeight: "bold",
                    textDecoration: "none",
                    boxShadow: "0 4px 6px rgba(0,0,0,0.1)"
                });

                container.appendChild(link);
            }

            let createdRecordId = null;
            if (Array.isArray(details.userMessage)) {
                const createdRespLine = details.userMessage.find(line => line && line.startsWith("createdRecordResp"));

                if (createdRespLine) {
                    try {
                        const jsonPart = createdRespLine.replace("createdRecordResp", "").trim();
                        const recordData = JSON.parse(jsonPart);
                        if (recordData.id) {
                            createdRecordId = recordData.id;
                        }
                    } catch (err) {
                        console.warn("❌ Could not parse createdRecordResp:", err);
                    }
                }
            }

            if (createdRecordId) {
                const container = document.getElementById("pdfDownloadContainer");

                const viewBtn = document.createElement("a");
                viewBtn.href = `https://crm.zoho.com/crm/org872394793/tab/Invoices/${createdRecordId}`;
                viewBtn.target = "_blank";
                viewBtn.textContent = "👁️ הצג רישום שנוצר";

                Object.assign(viewBtn.style, {
                    display: "inline-block",
                    marginTop: "10px",
                    marginLeft: "10px",
                    padding: "10px 16px",
                    backgroundColor: "#007bff",
                    color: "white",
                    borderRadius: "8px",
                    fontWeight: "bold",
                    textDecoration: "none",
                    boxShadow: "0 4px 6px rgba(0,0,0,0.1)"
                });

                container.appendChild(viewBtn);
            }
           
            resizeToContent();
            createBtn.textContent = "קבלה נוצרה ✅";
        })
        .catch(function (error) {
            console.error("❌ Full function error object:", error);
        
            let errorMessage = "Error executing function.";
            if (error && typeof error === "object") {
                if (error.message) {
                    errorMessage += " " + error.message;
                } else {
                    errorMessage += " " + JSON.stringify(error);
                }
            }
        
            outputEl.textContent = errorMessage;
            createBtn.disabled = false;
            createBtn.textContent = "Create receipt";
            hasReceiptBeenCreated = false;
        });
        
}


function extractDocumentURL(responseData) {
    try {
        const docLine = (responseData.userMessage || []).find(line => line?.startsWith("Create Document Response:"));
        if (!docLine) return null;
        const jsonPart = docLine.replace("Create Document Response: ", "").trim();
        const docData = JSON.parse(jsonPart);
        return docData?.url?.origin || null;
    } catch (err) {
        console.error("❌ Failed to extract doc URL:", err);
        return null;
    }
}

function resizeToContent() {
    const contentHeight = Math.max(
        document.body.scrollHeight,
        document.documentElement.scrollHeight
    );
    ZOHO.CRM.UI.Resize({ height: contentHeight + 20, width: 900 });
}


function mapPaymentTypeToGreenInvoice(typeLabel) {
    const cleanedLabel = typeLabel.replace(/\s*\(.*?\)/, "").trim(); // remove everything from the first "("
    const map = {
        "ניכוי במקור": 0,
        "מזומן": 1,
        "צ׳ק": 2,
        "כרטיס אשראי": 3,
        "העברה בנקאית": 4,
        "פייפאל": 5,
        "אפליקציית תשלום": 6,
        "אחר": 7,
        "Bit": 10,
        "Google Pay":10,
        "Apple Pay":10,


    };
    return map[cleanedLabel] || 0; // Default to "Other"
}

function mapCardTypeToGreenInvoice(cardLabel) {
    const cardTypeMap = {
        "Unknown (לא ידוע)": 0,
        "Isracard (ישראכרט)": 1,
        "Visa (ויזה)": 2,
        "Mastercard (מאסטרקארד)": 3,
        "American Express (אמריקן אקספרס)": 4,
        "Diners (דיינרס)": 5
    };

    return cardTypeMap[cardLabel.trim()] ?? 0; // Default to 0 if not matched
}

function mapDealTypeToGreenInvoice(dealTypeLabel) {
    const dealTypeMap = {
        "Standard": 1,
        "Payments": 2,
        "Credit": 3,
        "Deferred": 4,
        "Other": 5,
        "Recurring": 6
    };

    if (!dealTypeLabel || typeof dealTypeLabel !== "string") return 1;
    const cleaned = dealTypeLabel.trim();
    console.log("👉 Deal Type selected:", cleaned);

    return dealTypeMap[cleaned] ?? 1;
}


function handlePaymentTypeChange(selectEl) {
    const row = selectEl.closest("tr");
    const paymentType = selectEl.value;

    const isCard = paymentType === "כרטיס אשראי"; // Credit Card
    const isCash = paymentType === "מזומן"; // Cash
    const isCheque = paymentType === "צ׳ק"; // Cheque
    const isPaypal = paymentType === "פייפאל"; // PayPal
    const isBit = paymentType === "Bit"; // Bit
    const isGooglePay = paymentType === "Google Pay"; // Google Pay
    const isApplePay = paymentType === "Apple Pay"; // Apple Pay

    // Toggle card input fields
    row.querySelectorAll(".card-fields").forEach(el => {
        el.style.display = isCard ? "" : "none";
    });

    // Show bank fields for cheque and other bank-based types
    row.querySelectorAll(".bank-fields").forEach(el => {
        el.style.display = (!isCard && !isCash && !isPaypal && !isBit && !isGooglePay && !isApplePay) ? "" : "none"; // Hide bank fields for other types
    });
    // Toggle cheque fields
    row.querySelectorAll(".cheque-fields").forEach(el => {
        el.style.display = isCheque ? "" : "none";
    });

    // Toggle PayPal fields
    row.querySelectorAll(".paypal-fields").forEach(el => {
        el.style.display = isPaypal ? "" : "none";
    });

    // Toggle Bit fields
    row.querySelectorAll(".bit-fields").forEach(el => {
        el.style.display = isBit ? "" : "none"; // Show Bit fields when Bit is selected
    });

    // Toggle Google Pay fields
    row.querySelectorAll(".googlepay-fields").forEach(el => {
        el.style.display = isGooglePay ? "" : "none"; // Show Google Pay fields when Google Pay is selected
    });

    
    // Show Apple Pay fields if Apple Pay is selected
    row.querySelectorAll(".applepay-fields").forEach(el => {
        el.style.display = isApplePay ? "" : "none"; // Show Apple Pay fields
    });
}



function handleDealTypeChange(dealTypeSelect) {
    const selectedValue = dealTypeSelect.value;
    const row = dealTypeSelect.closest("tr");
    const numPaymentsContainer = row.querySelector("#numPaymentsContainer");
    const numPaymentsField = row.querySelector("#numPayments");

    if (selectedValue === "Payments" || selectedValue === "Credit") {
        numPaymentsContainer.style.display = "";
        numPaymentsField.disabled = false;
    } else {
        numPaymentsContainer.style.display = "";
        numPaymentsField.disabled = true;
    }
}


  
let hasReceiptBeenCreated = false;
ZOHO.embeddedApp.init();
