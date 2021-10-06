<powershell> 
Import-Module ServerManager

$instancetype = Invoke-RestMethod  http://169.254.169.254/latest/meta-data/instance-type
$instanceid= Invoke-RestMethod http://169.254.169.254/latest/meta-data/instance-id
$az= Invoke-RestMethod http://169.254.169.254/latest/meta-data/placement/availability-zone
$computername = $env:computername

$h1 = "<br><br>Hello from " + $computername + " instanceid: " + $instanceid + 
            "<br><br>I am running on " + $instancetype + " in availability zone " + $az

Enable-WindowsOptionalFeature -Online -NoRestart -FeatureName 'IIS-WebServerRole', 'IIS-WebServer', 'IIS-ManagementConsole'
"<html>
<head>
  <script>
    function getName() {
      const urlSearchParams = new URLSearchParams(window.location.search);
      const params = Object.fromEntries(urlSearchParams.entries());
      document.getElementById('nameKey').innerHTML = params.name;
    }
  </script>
</head>
<body onload='getName()'>
  <br /><br />
  <marquee>
    <h1>Hello Win306 Reinvent 2021!!</h1>
  </marquee>
  <h1>Showing data for key: <span id='nameKey'></span></h1>

  <span>
    <b>$h1</b>
  </span>
  <br />
  <img id='img' src='https://source.unsplash.com/1024x768/?cloud' />
</body>
</html>" | Out-File -FilePath C:\inetpub\wwwroot\index.html
</powershell>