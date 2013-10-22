How to generate an azure management certificate:


1. Create RSA private key. 
``` bash
    openssl genrsa -out management.key 2048
```
**Note: You will use the management.key file for the key property when creatings a pkgcloud Azure compute instance.**

2. Create a self signed certificate.
``` bash
    openssl req -new -key management.key -out management.csr
```

3. Create the management.pem x509 pem file from RSA key created in Step 1 and the self signed certificate created in Step 2. 
``` bash 
    openssl x509 -req -days 365 -in management.csr -signkey management.key -out management.pem
```
**Note: You will use the management.pem file for the cert property when creatings a pkgcloud Azure compute instance.**


4. Concatenate the management PEM file and RSA key file to a temporary .pem file. This file will be used to create the Management Certificate file you will upload to the Azure Portal.
``` bash
    cat management.key management.pem > temp.pem 
```

5. Create the Management Certificate file. This will be the Management Certificate .cer file you need to upload to the [Management Certificates section](https://manage.windowsazure.com/#Workspace/AdminTasks/ListManagementCertificates) of the Azure portal. 
``` bash
    openssl x509 -inform pem -in temp.pem -outform der -out management.cer
```

6. Secure your certificate and key files.
``` bash
    chmod 600 *.*
```

**Note: When creating a pkgcloud Azure compute instance, use the management.cert file for the cert property and the management.key file for the key property.
**

If you need a .pfx version of the management certificate.

``` bash
openssl pkcs12 -export -out management.pfx -in management.pem -inkey management.key -name "My Certificate"
```

<br/>
### Create an Azure Service Management certificate from a .publishsettings file:

For more information about this [read the article on windowsazure.com:](https://www.windowsazure.com/en-us/manage/linux/common-tasks/manage-certificates/) https://www.windowsazure.com/en-us/manage/linux/common-tasks/manage-certificates/

<br/>
### Create an Azure Service Management certificate on Windows:

For more information about this [read the article on MSDN:](http://msdn.microsoft.com/en-us/library/windowsazure/gg551722.aspx) http://msdn.microsoft.com/en-us/library/windowsazure/gg551722.aspx.

<br/>
<a name="azure-ssh-cert"></a>
## Azure x.509 SSH Certificates

### Create an Azure x.509 SSH certificate on Linux/Mac OSX:

1. Create x.509 pem file and key file
    
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 -keyout sshkey.key -out sshcert.pem

2. Change the permissions on the private key and certificate for security.

    chmod 600 sshcert.pem   
    chmod 600 sshkey.key
    
3. Specify the path to sshcert.pem in the ssh.cert config property when creating an Azure pkgcloud compute client.

4. If you specified a password when creating the pem file, add the password to the ssh.pemPassword config property when creating an Azure pkgcloud compute client.

5. When connecting with ssh to a running Azure compute server, specify the path to the sshkey.key file.
 
    ssh -i  sshkey.key -p <port> username@servicename.cloudapp.net

For more info: https://www.windowsazure.com/en-us/manage/linux/how-to-guides/ssh-into-linux/
