## Development

```bash
# First terminal
bun dev
# Second terminal
ngrok http http://localhost:8000
# Third terminal
curl -X POST https://87fc-208-127-188-136.ngrok-free.app/outbound-call \
-H "Content-Type: application/json" \
-d '{
    "number": "780-882-4742"
    }'
```

try and send the person to the 1-800 number
if not, connect through hubspot and try and book a meeting
