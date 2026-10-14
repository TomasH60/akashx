---
title: Akash local network deployment setup
---

# Akash local network deployment setup

## Provider requirements:

- Windows PC with Ubuntu running in WSL 2.
- Docker Engine installed inside WSL.
- K3s, kubectl, Helm, and socat installed inside WSL.
- Akash provider CLI and Kubernetes operators installed.
- A registered provider wallet funded with sandbox AKT.
- Access to the `sandbox-2` RPC.
- Network access from the Mac to the provider API and the container’s assigned port.
- A healthy inventory operator that detects the PC’s available resources.

## Tenant requirements:

- Akash provider-services CLI installed.
- A tenant wallet funded with sandbox AKT for transaction fees.
- Sufficient ACT to fund the deployment deposit and lease.
- A published Akash client certificate for provider API access.
- An SSH key pair for logging into the test container.
- An SDL file describing the container, resources, and provider requirements.
- Access to the `sandbox-2` RPC.
- Network access to the provider API and the container’s assigned SSH port.

## Provider setup:

### Step 1. Configure the Kubernetes cluster on the provider PC

Run this in Ubuntu WSL. It assumes Docker Engine and K3s are installed, but K3s has not yet been configured for this Akash lab.

```bash
sudo systemctl enable --now docker

sudo mkdir -p /etc/rancher/k3s

sudo tee /etc/rancher/k3s/config.yaml > /dev/null <<'YAML'
docker: true
node-name: akash-wsl
YAML

sudo systemctl restart k3s
```

- `enable --now` starts Docker and configures it to start automatically.
- `docker: true` makes K3s use Docker Engine as its container runtime.
- `node-name` gives the provider node a stable name.
- Restarting K3s applies the configuration.

K3s creates an administrator kubeconfig at `/etc/rancher/k3s/k3s.yaml`. Copy it so your normal WSL user can run `kubectl`:

```bash
mkdir -p "$HOME/.kube"

sudo install \
  -o "$USER" \
  -g "$(id -gn)" \
  -m 600 \
  /etc/rancher/k3s/k3s.yaml \
  "$HOME/.kube/akash-wsl.yaml"

export KUBECONFIG="$HOME/.kube/akash-wsl.yaml"

kubectl get nodes
```

- `mkdir -p` creates the directory if necessary.
- `-o` and `-g` make your user the owner of the copied file.
- `-m 600` restricts access to that user because kubeconfig contains cluster administrator credentials.
- `KUBECONFIG` tells `kubectl` which cluster access file to use.

Continue when `kubectl get nodes` shows `akash-wsl` with status `Ready`. No Akash provider or operator has been deployed yet.

### Step 2. Prepare Kubernetes and install the Akash operators

Run these commands in Ubuntu WSL. Keep `KUBECONFIG` set to the file created in Step 1.

```bash
export KUBECONFIG="$HOME/.kube/akash-wsl.yaml"

kubectl create namespace akash-services
kubectl create namespace lease
kubectl create namespace akash-gateway

kubectl label namespace akash-services akash.network=true
kubectl label namespace akash-services akash.network/name=akash-services
kubectl label namespace lease akash.network=true
kubectl label namespace akash-gateway akash.network=true
kubectl label node akash-wsl akash.network=true
```

The namespaces separate provider components, lease records, and gateway resources. The labels identify them and the K3s node to Akash. Because this is a fresh cluster, the `create` commands should succeed; do not recreate namespaces if they already exist.

Add the Akash chart repository and install the provider CRDs:

```bash
helm repo add akash https://akash-network.github.io/helm-charts
helm repo update

kubectl apply -f \
  https://raw.githubusercontent.com/akash-network/provider/v0.16.2/pkg/apis/akash.network/crd.yaml
```

`helm repo add` registers the chart repository; `helm repo update` refreshes its chart list. `kubectl apply -f` installs the resource definitions that Akash uses in Kubernetes.

Install the operators:

```bash
helm upgrade --install inventory-operator akash/akash-inventory-operator \
  --namespace akash-services \
  --version 19.0.2 \
  --set 'inventoryConfig.cluster_storage[0]=default' \
  --set 'inventoryConfig.cluster_storage[1]=ram'

helm upgrade --install akash-hostname-operator akash/akash-hostname-operator \
  --namespace akash-services \
  --version 19.0.2 \
  --set gatewayApi.enabled=false
```

`upgrade --install` installs a missing release or updates an existing one. `--namespace` selects `akash-services`; `--version` pins the chart version used in this guide. The inventory settings advertise default ephemeral storage and RAM-backed shared memory. `gatewayApi.enabled=false` matches this local lab, which does not have a Gateway API controller installed.

Check the result:

```bash
kubectl rollout status deployment/operator-inventory \
  --namespace akash-services \
  --timeout=300s

kubectl rollout status deployment/operator-hostname \
  --namespace akash-services \
  --timeout=300s

kubectl get pods --namespace akash-services
```

`--timeout=300s` limits each readiness wait to five minutes. Continue when both operators are ready and the inventory operator remains stable. In our earlier WSL run, Kubernetes reported GPU capacity but Akash could not identify the GPU, causing the inventory operator to restart. We need to check for that before installing the provider.

### Step 3. Check Akash connection

Check access to the sandbox chain:

```bash
export AKASH_CHAIN_ID="sandbox-2"
export AKASH_NODE="https://rpc.sandbox-2.aksh.pw:443"
provider-services query block
```

A returned block confirms that the provider PC can reach the RPC.

Before offering GPU deployments, resolve the earlier mismatch: Kubernetes reported one GPU, but the inventory operator discovered zero.

### Step 4. Create and fund the provider wallet (OPTIONAL)

Run these commands inside Ubuntu WSL. The provider and tenant should use separate wallets.

```bash
export AKASH_CHAIN_ID="sandbox-2"
export AKASH_NODE="https://rpc.sandbox-2.aksh.pw:443"
export AKASH_KEYRING_BACKEND="file"
export PROVIDER_KEY_NAME="my-provider"
provider-services keys add "$PROVIDER_KEY_NAME"
```

The CLI will display a recovery phrase. Save it securely offline. The `file` keyring backend protects the local wallet with a passphrase; remember that passphrase.

Display the wallet address and check its balance:

```bash
export PROVIDER_ADDRESS="$(provider-services keys show "$PROVIDER_KEY_NAME" -a)"
printf '%s\n' "$PROVIDER_ADDRESS"
provider-services query bank balances "$PROVIDER_ADDRESS"
```

The `-a` flag returns only the wallet address. The balance will initially be empty.

Request sandbox AKT for this address from the [sandbox-2 faucet](https://faucet.sandbox-2.aksh.pw). Then run the balance query again and confirm that it contains `uakt`. Keep enough sandbox AKT for provider transactions, bid deposits, and transaction fees.

```bash
provider-services query bank balances "$PROVIDER_ADDRESS"
```

Export an encrypted copy of the wallet for the provider Helm chart:

```bash
umask 077
mkdir -p "$HOME/akash-lab"
provider-services keys export "$PROVIDER_KEY_NAME" > "$HOME/akash-lab/key.txt"
```

The CLI will ask for your keyring passphrase and for a **new export password**. Save the export password separately; the provider's init container will need it to decrypt `key.txt`.

```bash
read -r -s -p "Enter the key export password: " PROVIDER_EXPORT_PASSWORD
printf '\n'
printf '%s' "$PROVIDER_EXPORT_PASSWORD" > "$HOME/akash-lab/key-pass.txt"
unset PROVIDER_EXPORT_PASSWORD
printf '%s\n' "$PROVIDER_ADDRESS" > "$HOME/akash-lab/provider-address.txt"
chmod 600 "$HOME/akash-lab/key.txt" "$HOME/akash-lab/key-pass.txt" "$HOME/akash-lab/provider-address.txt"
```

Enter **exactly the same export password** that you chose during `keys export`. The three files will be used in the next provider configuration step. Do not share the recovery phrase, `key.txt`, or `key-pass.txt`.

### Step 5. Create the provider configuration

Run these commands inside Ubuntu WSL. This configuration targets `sandbox-2` and uses `provider.akash.test` as the provider hostname for the local network test.

```bash
export AKASH_CHAIN_ID="sandbox-2"
export AKASH_NODE="https://rpc.sandbox-2.aksh.pw:443"
export PROVIDER_ADDRESS="$(cat "$HOME/akash-lab/provider-address.txt")"
export PROVIDER_KEY="$(openssl base64 -A -in "$HOME/akash-lab/key.txt")"
export PROVIDER_KEY_PASSWORD="$(openssl base64 -A -in "$HOME/akash-lab/key-pass.txt")"
```

`openssl base64 -A` encodes each file on one line, as the Helm chart expects. The exported variables contain sensitive wallet material; do not print them.

Create the Helm values file:

```bash
umask 077
cat > "$HOME/akash-lab/provider.yaml" <<EOF
from: "$PROVIDER_ADDRESS"
key: "$PROVIDER_KEY"
keysecret: "$PROVIDER_KEY_PASSWORD"
domain: "akash.test"
node: "$AKASH_NODE"
chainid: "$AKASH_CHAIN_ID"
withdrawalperiod: 12h

attributes:
  - key: host
    value: akash
  - key: tier
    value: community
  - key: lab
    value: tomas-ssh
  - key: feat-persistent-storage
    value: "false"
  - key: capabilities/ip-lease
    value: "false"

price_target_cpu: 1.60
price_target_memory: 0.30
price_target_hd_ephemeral: 0.02
price_target_hd_pers_hdd: 0.01
price_target_hd_pers_ssd: 0.03
price_target_hd_pers_nvme: 0.10
price_target_endpoint: 0.05
price_target_ip: 5.00
EOF
chmod 600 "$HOME/akash-lab/provider.yaml"
unset PROVIDER_KEY PROVIDER_KEY_PASSWORD
```

The `lab: tomas-ssh` attribute lets the tenant target this provider in the test SDL. `domain: akash.test` makes its API hostname `provider.akash.test`; the Mac will need to resolve that name to the provider PC when we configure network access. GPU attributes are omitted until the inventory operator detects the GPU correctly.

Download the pricing script used by the provider chart:

```bash
curl -fsSLo "$HOME/akash-lab/price_script.sh" \
  "https://raw.githubusercontent.com/akash-network/helm-charts/provider-19.0.2/charts/akash-provider/scripts/price_script_generic.sh"
chmod 700 "$HOME/akash-lab/price_script.sh"
```

For `curl`, `-f` fails on HTTP errors, `-sS` suppresses progress while retaining errors, `-L` follows redirects, and `-o` saves the script to the specified file.

Keep `provider.yaml` private: it contains the encrypted wallet export and its decryption password.

### Step 6. Install and verify the provider

The provider chart creates Gateway API resources, so install their CRDs first:

```bash
kubectl kustomize "https://github.com/nginx/nginx-gateway-fabric/config/crd/gateway-api/experimental?ref=v2.6.7" |
  kubectl apply --server-side -f -
```

`--server-side` applies the definitions through the Kubernetes API server. `-f -` reads them from the preceding command. Wait until Kubernetes recognizes `HTTPRoute`:

```bash
kubectl wait --for=condition=Established \
  crd/httproutes.gateway.networking.k8s.io \
  --timeout=120s
```

`--for=condition=Established` checks that the CRD is ready. `--timeout=120s` limits the wait to two minutes.

Install the provider using the files created in Steps 4 and 5:

```bash
cd "$HOME/akash-lab"

helm upgrade --install akash-provider akash/provider \
  --namespace akash-services \
  --version 19.0.2 \
  --values provider.yaml \
  --set bidpricescript="$(openssl base64 -A -in price_script.sh)"
```

- `upgrade --install` installs the release or updates an existing one.
- `--namespace akash-services` selects the namespace containing the Akash operators.
- `--version 19.0.2` pins the chart version used by this guide.
- `--values provider.yaml` loads the provider's wallet, network, attributes, and prices.
- `--set bidpricescript=...` passes the pricing script encoded on one line.

Check that the provider starts:

```bash
kubectl rollout status statefulset/akash-provider \
  --namespace akash-services \
  --timeout=300s

kubectl get pods --namespace akash-services
```

`--timeout=300s` limits the rollout check to five minutes. The expected result is `akash-provider-0` showing `1/1 Running`.

If the rollout fails, check the init container:

```bash
kubectl logs akash-provider-0 \
  --namespace akash-services \
  --container init \
  --tail=100
```

`--container init` selects the container that imports the wallet. `--tail=100` shows its last 100 log lines. A `failed to decrypt private key` error usually means `key-pass.txt` does not match the password chosen during the wallet export.

Once the pod is running, check the provider process:

```bash
kubectl logs akash-provider-0 \
  --namespace akash-services \
  --container provider \
  --tail=100
```

The next step is to verify registration on `sandbox-2` and make the provider API reachable from the Mac

### Step 7. Expose provider API

Do this after `akash-provider-0` shows `1/1 Running`. Repeat the Windows and Mac IP steps whenever you change Wi-Fi networks.

#### 1. Forward the provider API inside WSL

In Ubuntu WSL, run this in a terminal and leave it open:

```bash
kubectl port-forward \
  --namespace akash-services \
  --address=0.0.0.0 \
  service/akash-provider \
  8443:8443 8444:8444
```

`--namespace akash-services` selects the provider service. `--address=0.0.0.0` makes the forwarded ports reachable at WSL’s network address. Each `local:remote` pair forwards a WSL port to the same provider service port. If this command reports `socat not found`, install `socat` in WSL and run it again.

#### 2. Forward the ports from Windows to WSL

Open **PowerShell as Administrator** on the provider PC:

```powershell
$akashWindowsIp = (Get-NetIPAddress -InterfaceAlias "Wi-Fi" -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike "169.254.*" } | Select-Object -First 1 -ExpandProperty IPAddress)
$akashWslIp = ((wsl.exe hostname -I).Trim() -split '\s+')[0]

foreach ($port in 8443, 8444) {
    netsh interface portproxy delete v4tov4 listenaddress=$akashWindowsIp listenport=$port 2>$null
    netsh interface portproxy add v4tov4 listenaddress=$akashWindowsIp listenport=$port connectaddress=$akashWslIp connectport=$port
}

netsh interface portproxy show v4tov4
$akashWindowsIp
```

`-InterfaceAlias "Wi-Fi"` selects the Windows wireless adapter. `-AddressFamily IPv4` selects its IPv4 address. The `169.254.*` filter excludes an automatically assigned address that is not usable for this connection. `hostname -I` supplies WSL’s current IP. The `netsh` rules forward TCP ports `8443` and `8444` from Windows to WSL.

Allow those ports through Windows Firewall for devices on the local network:

```powershell
if (-not (Get-NetFirewallRule -Name "AkashProviderLabAPI" -ErrorAction SilentlyContinue)) {
    New-NetFirewallRule -Name "AkashProviderLabAPI" -DisplayName "Akash Provider Lab API" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 8443,8444 -RemoteAddress LocalSubnet -Profile Any
}
```

`-Direction Inbound` applies to connections arriving at Windows. `-Protocol TCP` and `-LocalPort 8443,8444` limit the rule to the provider API ports. `-RemoteAddress LocalSubnet` limits allowed clients to the local network. `-Profile Any` also works if Windows classifies a phone hotspot as a public network.

## Tenant setup:

### Step 1. Test connection to provider machine

Point the tenant hostname at the Windows PC

On the tenant, edit `/etc/hosts`:

```bash
sudo nano /etc/hosts
```

Add or update this line, replacing the IP with the value printed by `$akashWindowsIp`:

```text
WINDOWS_WIFI_IP provider.akash.test
```

Save the file. The hostname stays `provider.akash.test`; only its IP changes when the provider PC joins a different network.

#### Test from the tenant

```bash
nc -vz provider.akash.test 8443
nc -vz provider.akash.test 8444
```

For `nc`, `-v` prints connection details and `-z` checks whether the TCP port accepts a connection without sending data. Both tests should succeed. A timeout can mean Windows Firewall is blocking traffic or the Wi-Fi network prevents its connected devices from reaching each other.

Keep the WSL `kubectl port-forward` terminal running during the test. Forwarding the SSH container’s assigned port comes later, after the tenant has created a lease.

### Step 2. Create and fund the tenant wallet

Run these commands on the tenant PC:

```bash
export AKASH_CHAIN_ID="sandbox-2"
export AKASH_NODE="https://rpc.sandbox-2.aksh.pw:443"
export AKASH_GAS_PRICES="0.025uakt"
export AKASH_GAS_ADJUSTMENT="1.5"
export AKASH_KEYRING_BACKEND="file"
export TENANT_KEY_NAME="my-tenant"

provider-services keys list
```

The `file` keyring backend stores the wallet in an encrypted file. If `my-tenant` already appears, reuse it. Otherwise, create it:

```bash
provider-services keys add "$TENANT_KEY_NAME"
```

Save the displayed recovery phrase securely. Get the tenant address:

```bash
export OWNER="$(provider-services keys show "$TENANT_KEY_NAME" -a)"
printf '%s\n' "$OWNER"
```

The `-a` flag prints only the address. Request sandbox AKT for this address from the [sandbox-2 faucet](https://faucet.sandbox-2.aksh.pw), then confirm it arrived:

```bash
provider-services query bank balances "$OWNER"
```

Keep some `uakt` for transaction fees. The deployment deposit and lease will use `uact`, which we will prepare before creating the deployment.

### Step 3. Create the tenant client certificate

The certificate lets the tenant authenticate when sending a manifest to the provider API:

```bash
provider-services tx cert generate client --from "$TENANT_KEY_NAME"

provider-services tx cert publish client \
  --from "$TENANT_KEY_NAME" \
  --gas auto
```

`--from` selects the tenant wallet. `--gas auto` estimates the gas for publishing the certificate. Confirm the transaction when prompted.

Verify publication:

```bash
provider-services query cert list --owner "$OWNER"
```

`--owner` limits the results to the tenant address. Next, prepare the SSH key and the container’s SDL file.

### Step 4. Prepare the SSH container

Run these commands on the tenant PC. Create a dedicated SSH key if you do not already have one for this test:

```bash
mkdir -p "$HOME/.ssh"
chmod 700 "$HOME/.ssh"

if [ ! -f "$HOME/.ssh/akash_lab_ed25519" ]; then
  ssh-keygen -t ed25519 -f "$HOME/.ssh/akash_lab_ed25519"
fi
```

`-t ed25519` selects the key type. `-f` specifies where to save the key. Keep the private key on the tenant PC; only its `.pub` file goes into the container configuration.

Create a directory for the deployment and write `ssh.yaml`:

```bash
mkdir -p "$HOME/akash-ssh-test"
cd "$HOME/akash-ssh-test"

SSH_PUBLIC_KEY="$(cat "$HOME/.ssh/akash_lab_ed25519.pub")"

cat > ssh.yaml <<EOF
version: "2.0"

services:
  ssh:
    image: lscr.io/linuxserver/openssh-server:latest
    env:
      - USER_NAME=akash
      - PUBLIC_KEY=$SSH_PUBLIC_KEY
      - PASSWORD_ACCESS=false
    expose:
      - port: 2222
        as: 2222
        proto: tcp
        to:
          - global: true

profiles:
  compute:
    ssh:
      resources:
        cpu:
          units: 0.5
        memory:
          size: 512Mi
        storage:
          size: 1Gi

  placement:
    your-provider:
      attributes:
        lab: tomas-ssh
      pricing:
        ssh:
          denom: uact
          amount: 1000

deployment:
  ssh:
    your-provider:
      profile: ssh
      count: 1
EOF

unset SSH_PUBLIC_KEY
```

The image listens for SSH on container port `2222`. `PUBLIC_KEY` authorizes your tenant PC’s SSH key, while `PASSWORD_ACCESS=false` disables password login. The `lab: tomas-ssh` attribute matches the provider configuration. `amount: 1000` is the maximum bid price this deployment will accept, in `uact` per block; it is not the price charged merely for creating the SDL.

The provider will assign an external TCP port after the lease starts. That external port may differ from `2222`.

Next, fund the tenant wallet with ACT and create the on-chain deployment.

### Step 5. Fund and create the deployment

Run these commands on the tenant PC:

```bash
export AKASH_CHAIN_ID="sandbox-2"
export AKASH_NODE="https://rpc.sandbox-2.aksh.pw:443"
export AKASH_KEYRING_BACKEND="file"
export TENANT_KEY_NAME="my-tenant"
export OWNER="$(provider-services keys show "$TENANT_KEY_NAME" -a)"

cd "$HOME/akash-ssh-test"
provider-services query bank balances "$OWNER"
provider-services query deployment params
```

Confirm the wallet has sandbox `uakt` and check the chain’s minimum `uact` deposit. Mint ACT while retaining some AKT for transaction fees:

```bash
provider-services tx bme mint-act 5000000uakt \
  --from "$TENANT_KEY_NAME" \
  --gas auto
```

`--from` selects the tenant wallet. `--gas auto` estimates the transaction’s gas. Confirm the transaction when prompted, then **verify that the wallet actually has `uact`**:

```bash
provider-services query bank balances "$OWNER"
```

Create a new deployment sequence for this attempt:

```bash
export DSEQ="$(date +%s)"
printf '%s\n' "$DSEQ"
```

`date +%s` produces the current Unix timestamp. Use a **new value for each new deployment**; reusing an existing sequence causes `Deployment exists`.

If the chain reports a minimum deposit of `500000uact` and your wallet has at least that amount, create the deployment:

```bash
provider-services tx deployment create ssh.yaml \
  --from "$TENANT_KEY_NAME" \
  --dseq "$DSEQ" \
  --deposit 500000uact \
  --deposit-sources balance \
  --gas auto
```

- `--from` signs with the tenant wallet.
- `--dseq` assigns the new deployment sequence.
- `--deposit` funds its escrow with ACT.
- `--deposit-sources balance` uses ACT held in the wallet.
- `--gas auto` estimates gas for the transaction.

Confirm the transaction and check that its result contains `code: 0`. Save the `DSEQ`; the bid, lease, and manifest steps all refer to it.

Creating the deployment places the order on-chain. The provider can now evaluate it and submit a bid.

### Step 6. Check the provider’s bid and create the lease

Run these commands on the tenant PC. Use the same wallet that signed the deployment in Step 5. If you used `mac-tenant`, set:

```bash
export TENANT_KEY_NAME="mac-tenant"
export OWNER="$(provider-services keys show "$TENANT_KEY_NAME" -a)"
```

If you used `my-tenant` in Step 5, set `TENANT_KEY_NAME` to `my-tenant` instead. Changing wallets does not change the owner of an existing deployment.

Confirm that the deployment exists:

```bash
provider-services query deployment get \
  --owner "$OWNER" \
  --dseq "$DSEQ"
```

`--owner` selects the deployment owner. `--dseq` selects the deployment sequence created in Step 5.

List its open bids:

```bash
provider-services query market bid list \
  --owner "$OWNER" \
  --dseq "$DSEQ" \
  --state open
```

`--state open` limits the results to bids that can still be accepted. Find the bid from your provider PC and copy its provider address. If the list is empty, do not create a lease yet.

Set the provider address to the value shown in its bid:

```bash
export PROVIDER="REPLACE_WITH_PROVIDER_ADDRESS"
```

Create the lease:

```bash
provider-services tx market lease create \
  --dseq "$DSEQ" \
  --gseq 1 \
  --oseq 1 \
  --provider "$PROVIDER" \
  --from "$TENANT_KEY_NAME" \
  --gas auto
```

- `--dseq` selects this deployment.
- `--gseq 1` selects its first resource group.
- `--oseq 1` selects its first order.
- `--provider` selects the provider whose bid you accepted.
- `--from` signs with the wallet that owns the deployment.
- `--gas auto` estimates the gas limit.

Confirm the transaction when prompted. Its result should contain `code: 0`. Keep the values of `DSEQ` and `PROVIDER` for the manifest step.

Confirm the lease transaction has `code: 0`, then verify that it is active:

```bash
provider-services query market lease list \
  --owner "$OWNER" \
  --dseq "$DSEQ"
```

`--owner` and `--dseq` limit the results to this deployment. An active lease completes the on-chain trade; the container starts after you send its manifest.

### Step 7. Send the manifest

On the tenant PC, send the **same `ssh.yaml`** used to create the deployment:

```bash
cd "$HOME/akash-ssh-test"

provider-services send-manifest ssh.yaml \
  --dseq "$DSEQ" \
  --provider "$PROVIDER" \
  --from "$TENANT_KEY_NAME"
```

`--dseq` identifies the deployment, `--provider` selects the provider holding the lease, and `--from` authenticates as the tenant wallet.

Check the service and its assigned SSH port:

```bash
provider-services lease-status \
  --dseq "$DSEQ" \
  --provider "$PROVIDER" \
  --from "$TENANT_KEY_NAME"
```

Wait until `services.ssh.ready_replicas` is `1`. Under `forwarded_ports.ssh`, record **`externalPort`**. This is the port the tenant PC connects to; `2222` is the port inside the container.

### Step 8. Forward the SSH port through Windows

Run this in **Administrator PowerShell on the provider PC**. Replace `30625` with the `externalPort` from Step 7:

```powershell
$sshPort = 30625
$windowsIp = (Get-NetIPAddress -InterfaceAlias "Wi-Fi" -AddressFamily IPv4).IPAddress
$wslIp = ((wsl.exe hostname -I).Trim() -split '\s+')[0]

netsh interface portproxy add v4tov4 listenaddress=$windowsIp listenport=$sshPort connectaddress=$wslIp connectport=$sshPort
New-NetFirewallRule -DisplayName "Akash SSH $sshPort" -Direction Inbound -Action Allow -Protocol TCP -LocalPort $sshPort -RemoteAddress LocalSubnet

$windowsIp
```

`listenaddress` binds the port to the provider PC’s current Wi-Fi IP. `connectaddress` forwards connections to its current WSL IP. Both addresses can change when the provider PC joins another network or WSL restarts. The firewall rule allows TCP connections to the assigned SSH port from the local subnet.

### Step 9. Connect from the tenant PC

Use the Windows Wi-Fi IP printed in Step 8. If Step 1 already maps `provider.akash.test` to that IP, check the port and connect:

```bash
export SSH_EXTERNAL_PORT=30625

nc -vz provider.akash.test "$SSH_EXTERNAL_PORT"

ssh -i "$HOME/.ssh/akash_lab_ed25519" \
  -p "$SSH_EXTERNAL_PORT" \
  akash@provider.akash.test
```

Replace `30625` with this lease’s `externalPort`. For `nc`, `-v` displays the connection result and `-z` tests the TCP port without sending data. For `ssh`, `-i` selects the private key created in Step 4, and `-p` selects the external port. The username is `akash` because Step 4 set `USER_NAME=akash`.

The SSH session is running inside the tenant’s container on the provider PC.

### Step 10. Close the deployment when finished

Run this on the tenant PC when you no longer need the container:

```bash
provider-services tx deployment close \
  --dseq "$DSEQ" \
  --from "$TENANT_KEY_NAME" \
  --gas auto
```

`--dseq` identifies the deployment, `--from` signs with its owner wallet, and `--gas auto` estimates the transaction fee. Confirm the transaction and check for `code: 0`. Closing the deployment ends its lease and stops ongoing charges.

## Command cheat sheet

Run tenant commands on the **tenant PC**. In a new terminal, restore the values for the deployment you want to inspect:

```bash
export AKASH_CHAIN_ID="sandbox-2"
export AKASH_NODE="https://rpc.sandbox-2.aksh.pw:443"
export AKASH_KEYRING_BACKEND="file"
export TENANT_KEY_NAME="mac-tenant"
export OWNER="$(provider-services keys show "$TENANT_KEY_NAME" -a)"
export PROVIDER="akash1f667m5r37r6gchhc9jfr7enzl8fvswv7ae3jvj"
export DSEQ="REPLACE_WITH_DEPLOYMENT_DSEQ"
```

`OWNER` is the tenant wallet address. `PROVIDER` is the provider wallet address. `DSEQ` identifies one deployment; set it to the sequence returned when that deployment was created.

### Check the deployment

```bash
provider-services query deployment get \
  --owner "$OWNER" \
  --dseq "$DSEQ"
```

`--owner` and `--dseq` select the exact deployment. Check its `state` and the state of its resource group.

### Check bids

```bash
provider-services query market bid list \
  --owner "$OWNER" \
  --dseq "$DSEQ"
```

This shows bids for the deployment, regardless of state. To see only bids still available to accept:

```bash
provider-services query market bid list \
  --owner "$OWNER" \
  --dseq "$DSEQ" \
  --state open
```

`--state open` filters out bids that are no longer open. Add `--provider "$PROVIDER"` to either command to show only bids from your provider PC.

### Check leases

```bash
provider-services query market lease list \
  --owner "$OWNER" \
  --dseq "$DSEQ"
```

This lists leases for the deployment. To inspect the lease with your provider:

```bash
provider-services query market lease get \
  --owner "$OWNER" \
  --dseq "$DSEQ" \
  --gseq 1 \
  --oseq 1 \
  --provider "$PROVIDER"
```

`--gseq 1` and `--oseq 1` select the first group and order; `--provider` selects the provider that won the lease.

### Check container readiness and assigned ports

```bash
provider-services lease-status \
  --dseq "$DSEQ" \
  --provider "$PROVIDER" \
  --from "$TENANT_KEY_NAME"
```

`--from` authenticates with the tenant wallet. Check `ready_replicas` for the SSH service and `forwarded_ports.ssh[].externalPort` for its current external TCP port.

### View container logs

```bash
provider-services lease-logs \
  --dseq "$DSEQ" \
  --provider "$PROVIDER" \
  --from "$TENANT_KEY_NAME"
```

The deployment and provider flags select the lease; `--from` authenticates as its owner.

### Check the tenant wallet balance

```bash
provider-services query bank balances "$OWNER"
```

The output shows the wallet’s `uakt` for transaction fees and any `uact` available for deployment deposits.

### Connect over SSH

Set the port to the `externalPort` shown by `lease-status`:

```bash
export SSH_EXTERNAL_PORT="REPLACE_WITH_EXTERNAL_PORT"

ssh -i "$HOME/.ssh/akash_lab_ed25519" \
  -p "$SSH_EXTERNAL_PORT" \
  akash@provider.akash.test
```

`-i` selects the tenant PC’s private key. `-p` selects the lease’s external SSH port. The hostname must point to the provider PC’s current Windows Wi-Fi IP.

### Close the deployment

Run this when the test is finished:

```bash
provider-services tx deployment close \
  --dseq "$DSEQ" \
  --from "$TENANT_KEY_NAME" \
  --gas auto
```

`--dseq` identifies the deployment, `--from` signs with its owner wallet, and `--gas auto` estimates the transaction fee. Confirm the transaction and check for `code: 0`.

### Provider PC checks

Run these inside WSL on the **provider PC**:

```bash
sudo kubectl get pods --namespace akash-services
sudo kubectl get pods --namespace lease
sudo kubectl logs akash-provider-0 \
  --namespace akash-services \
  --container provider \
  --tail=100
```

`--namespace` selects the provider or workload namespace. `--container provider` reads the provider process rather than its init container; `--tail=100` limits the log output.

To find what the provider logged for a particular deployment:

```bash
sudo kubectl logs akash-provider-0 \
  --namespace akash-services \
  --container provider \
  --since=30m |
  grep -F "$OWNER/$DSEQ/"
```

`--since=30m` limits the search to recent logs. `grep -F` matches the owner and DSEQ literally.

### Windows port-forwarding check

Run this in PowerShell on the **provider PC**:

```powershell
netsh interface portproxy show v4tov4
```

Find a rule whose listening address is the provider PC’s **current Wi-Fi IP** and whose listening port matches the SSH `externalPort`. Its destination must be the current WSL IP and the same port.
