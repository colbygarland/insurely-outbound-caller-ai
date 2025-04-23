## Development

```bash
# First terminal
bun dev
# Second terminal
ngrok http http://localhost:8000
# Third terminal
curl -X POST https://4138-208-127-188-75.ngrok-free.app/outbound-call \
-H "Content-Type: application/json" \
-d '{
    "number": "780-882-4742",
    "firstName": "Colby",
    "lastName": "Garland",
    "email": "colbyrobyn2017@gmail.com"
    }'


# To debug, run debugging on the file itself
```
