# Admin Quiz Manager - Technical Debugging Guide

## Quick Diagnosis

If buttons are still not working, follow this flowchart:

```
Quiz Delete Button Not Working?
│
├─→ Check 1: Network Request
│   │ F12 → Network tab
│   │ Click Delete button
│   │ ✓ Do you see DELETE request to /api/admin/quizzes/:id?
│   │ 
│   └─ NO: JavaScript error (check Console tab)
│   └─ YES: Check status code in next step
│
├─→ Check 2: Response Status
│   │ Click on DELETE request in Network
│   │ Look at Status column
│   │ 
│   ├─ 401 Unauthorized → Session/Auth issue
│   ├─ 403 Forbidden → Not admin user
│   ├─ 404 Not Found → Wrong quiz ID
│   └─ 500 Server Error → Backend issue
│
├─→ Check 3: Browser Console
│   │ F12 → Console tab
│   │ Any red error messages?
│   │ 
│   └─ Check error type below
```

---

## Common Issues & Solutions

### Issue 1: "401 Unauthorized" Response

**Symptom:**
- Network tab shows DELETE request with status 401
- Error message: "Error deleting quiz: Unauthorized"

**Cause:**
- Session cookie not being sent with request
- Session expired
- User is not actually authenticated

**Solution:**
```javascript
// Check if session cookie exists
document.cookie
// Look for: connect.sid=xxxxx; Path=/; HttpOnly

// If missing, log out and log back in
fetch('/api/auth/logout', { method: 'POST' });
// Then log in again
```

**Code Fix Applied:**
All fetch calls now include:
```javascript
credentials: 'include'  // ← This ensures cookies are sent
```

---

### Issue 2: "403 Forbidden" Response

**Symptom:**
- Network status: 403
- Error message: "Error: Server error" or "Access denied"

**Cause:**
- User is not admin
- `isAdmin` middleware blocked the request

**Solution:**
Check if user is admin:
```javascript
// In browser console
fetch('/api/auth/me', { credentials: 'include' })
  .then(r => r.json())
  .then(data => console.log(data.user.role))
// Should print: "admin"

// To make a user admin, edit data/users.json:
// Find user → set "role": "admin"
```

---

### Issue 3: "404 Not Found" Response

**Symptom:**
- Network status: 404
- Quiz table shows quiz, but delete fails

**Cause:**
- Quiz ID is wrong/corrupted
- Quiz was already deleted

**Solution:**
Check actual quiz IDs:
```javascript
// Inspect the delete button's onclick
document.querySelector('[data-action="delete"]').onclick.toString()
// Should show valid UUIDs in the function

// Or check quiz data from last load
console.log(quizList)
// Should show array of quizzes with valid IDs
```

---

### Issue 4: Button Never Becomes Enabled Again

**Symptom:**
- Delete button shows "Deleting…"
- Button stays disabled forever
- No error message appears

**Cause:**
- Network request timed out
- Fetch promise never resolves

**Solution:**
```javascript
// Check browser Network tab for stuck requests
// Reload page (Ctrl+R or Cmd+R)
// Try again with network connection verified

// Or check for JavaScript errors in Console
// that might prevent error handling from executing
```

---

### Issue 5: Modal Closes Unexpectedly

**Symptom:**
- Click Delete button
- Confirm modal appears
- Modal closes automatically
- Quiz not deleted

**Cause:**
- Clicking outside modal was closing it
- Double-click registered as dismiss

**Solution Applied:**
Modal now prevents dismiss on backdrop click:
```html
<div id="confirmModal" class="..." 
     onclick="event.target.id === 'confirmModal' ? closeConfirmModal() : null">
     <!-- Only closes if you click the backdrop, not the inner div -->
</div>
```

---

## Advanced Debugging

### Method 1: Enable Request/Response Logging

Add this to browser console:
```javascript
// Wrap fetch to log all requests
const originalFetch = window.fetch;
window.fetch = function(...args) {
  console.log('FETCH:', args[0], args[1]);
  return originalFetch.apply(this, args).then(r => {
    console.log('RESPONSE:', r.status, r.statusText);
    return r;
  });
};
```

Then try any action and see all requests/responses logged.

---

### Method 2: Check Session Cookie

```javascript
// See all cookies
console.log(document.cookie);

// Check specific cookie (usually connect.sid)
const getCookie = (name) => {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop().split(';').shift();
};
console.log('Session:', getCookie('connect.sid'));
```

---

### Method 3: Verify CORS Settings

```javascript
// Test CORS with credentials
fetch('/api/auth/me', {
  credentials: 'include'  // ← Must be included
})
.then(r => {
  console.log('Status:', r.status);
  console.log('Headers:', Array.from(r.headers.entries()));
  return r.json();
})
.then(data => console.log('User:', data.user))
.catch(e => console.error('Error:', e));
```

---

### Method 4: Check Backend Logs

If you have access to server logs:
```bash
# Look for these entries when trying to delete
tail -f /path/to/server/logs

# Should see:
# Admin delete quiz error: (if there's an error)
# Or successful deletion confirmation
```

---

## Testing Utilities

### Script to Test All Endpoints

```javascript
async function testAdminEndpoints() {
  const baseURL = '/api/admin/quizzes';
  const opts = { 
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' }
  };
  
  try {
    // Test GET
    console.log('Testing GET /api/admin/quizzes...');
    const listRes = await fetch(baseURL, opts);
    console.log('List Status:', listRes.status);
    const quizzes = await listRes.json();
    console.log('Quiz Count:', quizzes.length);
    
    if (quizzes.length > 0) {
      const testId = quizzes[0].id;
      console.log('Testing with ID:', testId);
      
      // Test GET by ID
      console.log('Testing GET by ID...');
      const detailRes = await fetch(`${baseURL}/${testId}`, opts);
      console.log('Detail Status:', detailRes.status);
      
      // Test PATCH (publish)
      console.log('Testing PATCH publish...');
      const publishRes = await fetch(`${baseURL}/${testId}/publish`, {
        ...opts,
        method: 'PATCH',
        body: JSON.stringify({ isPublished: true })
      });
      console.log('Publish Status:', publishRes.status);
      
      // Test DELETE (soft)
      console.log('Testing DELETE...');
      const deleteRes = await fetch(`${baseURL}/${testId}`, {
        ...opts,
        method: 'DELETE'
      });
      console.log('Delete Status:', deleteRes.status);
      const deleteBody = await deleteRes.json();
      console.log('Delete Response:', deleteBody);
    }
  } catch (err) {
    console.error('Test Error:', err);
  }
}

// Run in browser console
testAdminEndpoints();
```

---

## Browser DevTools Tips

### Network Tab
1. Right-click request → Copy as cURL
2. Paste in terminal to test endpoint directly
3. Check response headers for auth-related issues
4. Check response body for error messages

### Console Tab
1. Set log level to "Verbose" to see all messages
2. Use `console.table()` to format quiz data nicely
3. Use `console.time()` to measure operation duration
4. Watch for CORS errors (usually red, with "Access" in message)

### Application Tab (formerly Storage)
- **Cookies**: Check for `connect.sid` (session)
- **Local Storage**: Check for cached data
- **Session Storage**: Check for temporary auth tokens

---

## Common Code Issues & Fixes

### Before (Broken)
```javascript
async function doDelete() {
  const res = await fetch(`/api/admin/quizzes/${id}`, { 
    method: 'DELETE'  // Missing credentials!
  });
  // ...no button state management
  // ...no error recovery
}
```

### After (Fixed)
```javascript
async function doDelete() {
  const btn = document.getElementById('confirmOkBtn');
  btn.disabled = true;
  btn.textContent = 'Deleting…';
  
  try {
    const res = await fetch(`/api/admin/quizzes/${id}`, { 
      method: 'DELETE',
      credentials: 'include',       // ✅ Send session cookie
      headers: { 'Content-Type': 'application/json' }
    });
    if (!res.ok) throw new Error(/* ... */);
    // Success...
  } catch (err) {
    btn.disabled = false;           // ✅ Re-enable on error
    btn.textContent = 'Delete';
    showBanner('Error: ' + err.message, 'error');
  }
}
```

---

## Performance Considerations

### Slow Operations?
```javascript
// Measure operation time
console.time('delete-quiz');
// ...perform delete...
console.timeEnd('delete-quiz');
// Logs: delete-quiz: 1234ms
```

Normal times:
- List quizzes: 100-300ms
- Create quiz: 300-500ms
- Delete quiz: 200-400ms
- Load quiz details: 50-150ms

If much slower, check:
- Network tab for slow requests
- Server CPU/memory usage
- Database query performance

---

## Final Checklist

- [ ] All buttons show loading state during operation
- [ ] Delete button works (quiz disappears and shows in "Deleted" filter)
- [ ] Publish/Unpublish buttons work
- [ ] Duplicate/Copy button works
- [ ] Create new quiz works
- [ ] Edit quiz works
- [ ] Error messages are helpful and specific
- [ ] Button is re-enabled if operation fails
- [ ] Modal doesn't close accidentally
- [ ] Filters (Search, Mode, Status) work properly
- [ ] Refresh button reloads list
- [ ] No JavaScript errors in console
